import jwt from 'jsonwebtoken';

export function tokenFor(user: { id: number }) {
  return jwt.sign({ userId: user.id }, process.env.JWT_SECRET as string, { expiresIn: '15m' });
}

export function bearer(user: { id: number }) {
  return `Bearer ${tokenFor(user)}`;
}
