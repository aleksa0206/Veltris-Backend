import * as userRepository from '../repositories/userRepository';

// Every user only ever sees and edits their own profile.
export async function updateMe(
  userId: number,
  data: { firstName?: string; lastName?: string; email?: string }
) {
  return await userRepository.update(userId, data);
}
