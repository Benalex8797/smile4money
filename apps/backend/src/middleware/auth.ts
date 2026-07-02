import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'test-secret';

declare module 'express-serve-static-core' {
  interface Request {
    address?: string;
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const auth = req.header('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, SECRET) as { address?: string };
    if (!payload || typeof payload.address !== 'string') {
      return res.status(401).json({ error: 'unauthorized' });
    }
    req.address = payload.address;
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}
