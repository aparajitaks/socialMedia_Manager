import { Router, Request, Response } from 'express';
import { db, DEFAULT_CLIENT_ID } from '../db.js';
import { PlatformType, PostStatus } from '../types/index.js';
import { getPublisher } from '../publishers/index.js';

const router = Router();

export interface BulkRow {
  row_number: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  timezone?: string;
  platform: PlatformType;
  social_account_id?: string;
  account_name?: string;
  caption: string;
  media?: string;
  link?: string;
  status?: string;
}

export interface RowError {
  row_number: number;
  row: any;
  errors: string[];
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Simple CSV parser handling quotes
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of lines[i]) {
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] || '';
    });
    rows.push(rowObj);
  }

  return rows;
}

// POST /api/bulk/validate — Validate CSV rows with row-level error reporting
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { csv_content, rows: rawRows, client_id } = req.body;
    const clientId = client_id || DEFAULT_CLIENT_ID;
    const accounts = await db.getSocialAccounts(clientId);

    const rowsToValidate: any[] = rawRows || (csv_content ? parseCSV(csv_content) : []);

    if (rowsToValidate.length === 0) {
      return res.status(400).json({ error: 'No data rows found in CSV' });
    }

    const validRows: any[] = [];
    const invalidRows: RowError[] = [];
    const warnings: string[] = [];
    const seenSchedules = new Set<string>();

    for (let i = 0; i < rowsToValidate.length; i++) {
      const r = rowsToValidate[i];
      const rowNum = i + 1;
      const errors: string[] = [];

      // Required fields: date, time, caption
      const date = r.date || r.scheduled_date;
      const time = r.time || r.scheduled_time || '09:00';
      const caption = r.caption || r.content || r.text || '';
      const platform = (r.platform || '').toLowerCase() as PlatformType;
      const accountIdentifier = r.social_account_id || r.socialaccount || r.account || r.account_name;

      if (!date) errors.push('Missing date (expected YYYY-MM-DD)');
      else if (isNaN(new Date(date).getTime())) errors.push(`Invalid date format: ${date}`);

      if (!caption || caption.trim().length === 0) {
        errors.push('Missing caption content');
      }

      // Match account
      let matchedAccount = null;
      if (accountIdentifier) {
        matchedAccount = accounts.find(
          (a) =>
            a.id === accountIdentifier ||
            a.display_name?.toLowerCase() === accountIdentifier.toLowerCase() ||
            a.external_username?.toLowerCase() === accountIdentifier.toLowerCase()
        );
      }
      if (!matchedAccount && platform) {
        matchedAccount = accounts.find((a) => a.platform === platform);
      }

      if (!matchedAccount) {
        errors.push(`No connected social account found for "${accountIdentifier || platform}"`);
      } else {
        // Validate platform constraints
        try {
          const publisher = getPublisher(matchedAccount.platform);
          if (publisher.validatePost) {
            const val = publisher.validatePost({
              content: caption,
              media_urls: r.media ? [r.media] : [],
            }, matchedAccount);
            if (!val.valid) {
              errors.push(...val.errors);
            }
          }
        } catch (_) {}
      }

      // Check duplicates within batch
      const scheduleKey = `${date}_${time}_${matchedAccount?.id || platform}`;
      if (seenSchedules.has(scheduleKey)) {
        warnings.push(`Row ${rowNum}: Another post is already scheduled for the exact same slot (${date} ${time})`);
      } else {
        seenSchedules.add(scheduleKey);
      }

      if (errors.length > 0) {
        invalidRows.push({ row_number: rowNum, row: r, errors });
      } else {
        validRows.push({
          row_number: rowNum,
          date,
          time,
          timezone: r.timezone || matchedAccount?.timezone || 'UTC',
          platform: matchedAccount!.platform,
          social_account_id: matchedAccount!.id,
          display_name: matchedAccount!.display_name,
          caption,
          media_urls: r.media ? [r.media] : [],
          status: r.status || 'scheduled',
        });
      }
    }

    res.json({
      total_rows: rowsToValidate.length,
      valid_count: validRows.length,
      invalid_count: invalidRows.length,
      valid_rows: validRows,
      invalid_rows: invalidRows,
      warnings,
      can_import: invalidRows.length === 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bulk/import — Import validated rows into posts and schedules
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { valid_rows, client_id } = req.body;
    const clientId = client_id || DEFAULT_CLIENT_ID;

    if (!valid_rows || !Array.isArray(valid_rows) || valid_rows.length === 0) {
      return res.status(400).json({ error: 'valid_rows array is required' });
    }

    const createdPosts = [];

    for (const r of valid_rows) {
      const scheduledIso = new Date(`${r.date}T${r.time}:00`).toISOString();
      const post = await db.createPost({
        client_id: clientId,
        social_account_id: r.social_account_id,
        platform: r.platform,
        content: r.caption,
        media_urls: r.media_urls || [],
        scheduled_at: scheduledIso,
        status: (r.status as PostStatus) || 'scheduled',
        campaign_label: 'CSV Bulk Import',
        timezone: r.timezone || 'UTC',
      });
      createdPosts.push(post);
    }

    res.status(201).json({
      success: true,
      imported_count: createdPosts.length,
      posts: createdPosts,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
