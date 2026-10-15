import multer from 'multer';
import { bad } from './http.js';

/** One Excel or CSV file, kept in memory (never written to disk). */
export const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/\.(xlsx|xls|csv)$/i.test(file.originalname)) cb(null, true);
    else cb(bad('Choose an Excel (.xlsx, .xls) or .csv file.'));
  },
}).single('file');

export function needFile(req) {
  if (!req.file) throw bad('Choose a file to upload.');
  return req.file;
}

/** Form fields sent as JSON text alongside a file. */
export function jsonField(req, name, fallback = null) {
  const v = req.body?.[name];
  if (v == null || v === '') return fallback;
  try {
    return JSON.parse(v);
  } catch {
    throw bad(`${name} is not valid.`);
  }
}
