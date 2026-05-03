import { Request, Response, NextFunction } from 'express';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';

const proxyCacheDir = process.env.UPLOAD_DIR ? path.join(process.env.UPLOAD_DIR, 'proxy_cache') : './uploads/proxy_cache';

// Créer le dossier cache si inexistant
if (!fs.existsSync(proxyCacheDir)) {
  fs.mkdirSync(proxyCacheDir, { recursive: true });
}

const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const maxSize = 8 * 1024 * 1024; // 8 MB

export async function proxyImage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const encodedUrl = req.query.url as string;
    if (!encodedUrl) {
      res.status(400).json({ error: 'Missing url parameter' });
      return;
    }

    let targetUrl: string;
    try {
      targetUrl = decodeURIComponent(encodedUrl);
    } catch {
      res.status(400).json({ error: 'Invalid URL' });
      return;
    }

    // Valider l'URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      res.status(400).json({ error: 'Invalid URL' });
      return;
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      res.status(400).json({ error: 'Invalid protocol' });
      return;
    }

    // Vérifier le cache
    const cacheKey = Buffer.from(targetUrl).toString('base64url');
    const cachePath = path.join(proxyCacheDir, cacheKey);
    if (fs.existsSync(cachePath)) {
      const stats = fs.statSync(cachePath);
      if (Date.now() - stats.mtimeMs < 24 * 60 * 60 * 1000) { // TTL 24h
        const cachedData = fs.readFileSync(cachePath);
        res.set('Content-Type', 'image/*');
        res.set('Cache-Control', 'public, max-age=86400');
        res.send(cachedData);
        return;
      }
    }

    // Fetch l'image
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const fetchReq = protocol.get(targetUrl, (fetchRes) => {
      if (!fetchRes.statusCode || fetchRes.statusCode < 200 || fetchRes.statusCode >= 300) {
        res.status(502).json({ error: 'Failed to fetch image' });
        return;
      }

      const contentType = fetchRes.headers['content-type'] || '';
      if (!allowedMimeTypes.some(t => contentType.includes(t.replace('image/', '')))) {
        res.status(400).json({ error: 'Unsupported image type' });
        return;
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;
      fetchRes.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > maxSize) {
          fetchReq.destroy();
          res.status(413).json({ error: 'Image too large' });
          return;
        }
        chunks.push(chunk);
      });

      fetchRes.on('end', () => {
        const data = Buffer.concat(chunks);
        // Mettre en cache
        try {
          fs.writeFileSync(cachePath, data);
        } catch { /* ignore cache write errors */ }

        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=86400');
        res.send(data);
      });

      fetchRes.on('error', () => {
        res.status(502).json({ error: 'Failed to fetch image' });
      });
    });

    fetchReq.on('error', () => {
      res.status(502).json({ error: 'Failed to fetch image' });
    });
    fetchReq.end();
  } catch (err) {
    next(err);
  }
}
