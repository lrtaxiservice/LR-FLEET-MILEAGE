import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { h, bad } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { excelUpload, needFile, jsonField } from '../lib/upload.js';
import { isYmd, todayIST } from '../lib/dates.js';
import { openMasterFile, previewMaster, MASTER_FIELDS } from '../services/vehicleMaster.js';
import { commitMaster } from '../services/vehicleMaster.js';

const r = Router();
r.use(requireAdmin);

r.post(
  '/preview',
  excelUpload,
  h(async (req, res) => {
    const file = needFile(req);
    const opened = await openMasterFile(file.buffer, file.originalname, jsonField(req, 'mapping'));
    const preview = await previewMaster(prisma, opened).catch((e) => {
      // Missing columns: still return the headers so the mapping can be chosen.
      if (e.status === 400) return { headers: opened.headers, mapping: opened.mapping, needMapping: e.message };
      throw e;
    });
    res.json({ fields: MASTER_FIELDS, ...preview });
  }),
);

r.post(
  '/commit',
  excelUpload,
  h(async (req, res) => {
    const file = needFile(req);
    const effectiveDate = req.body.effectiveDate || todayIST();
    if (!isYmd(effectiveDate)) throw bad('Choose a valid "Changes start from" date.');
    const opened = await openMasterFile(file.buffer, file.originalname, jsonField(req, 'mapping'));
    const preview = await previewMaster(prisma, opened);
    const result = await commitMaster(prisma, req, preview, effectiveDate, file.originalname);
    res.json(result);
  }),
);

export default r;
