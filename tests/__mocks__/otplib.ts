export class TOTP {
  generateSecret() {
    return 'MOCKSECRET';
  }
  async verify(token: string, _options?: any) {
    return { valid: token === '123456' };
  }
  toURI(_options?: any) {
    return 'otpauth://totp/mock';
  }
}

export class NobleCryptoPlugin {}
export class ScureBase32Plugin {}
