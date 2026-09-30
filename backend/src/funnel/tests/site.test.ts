/**
 * The site key and the SSRF guard — no network needed: every refusal here
 * happens before a request would leave the machine.
 */
import { normaliseSite, isPrivateAddress, fetchPublicHtml } from '../site';
import { readFunnelConfig } from '../funnel.config';

describe('normaliseSite — every spelling of one site is one key', () => {
  it.each([
    'http://contractnest.com', 'https://www.contractnest.com/', 'contractnest.com/about?x=1',
    'CONTRACTNEST.COM', ' www.ContractNest.com. ',
  ])('%s → contractnest.com', (input) => {
    expect(normaliseSite(input)).toEqual({ host: 'contractnest.com', url: 'https://contractnest.com/' });
  });

  it.each([
    ['', /enter your website/],
    ['ftp://contractnest.com', /only http and https/],
    ['http://10.0.0.5', /not a public website name/],
    ['http://[::1]/', /not a public website name/],
    ['localhost', /not a public website name/],
    ['http://contractnest.com:8080', /standard ports/],
    ['javascript:alert(1)', /only http and https|not a public|not a website address/],
  ])('refuses %p', (input, msg) => {
    expect(() => normaliseSite(input)).toThrow(msg);
  });
});

describe('isPrivateAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1'])('%s is private', (a) => {
    expect(isPrivateAddress(a)).toBe(true);
  });
  it.each(['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700:4700::1111'])('%s is public', (a) => {
    expect(isPrivateAddress(a)).toBe(false);
  });
});

describe('fetchPublicHtml refuses internal targets before any request', () => {
  it.each([
    ['http://localhost/', /does not point at a public website/],
    ['http://127.0.0.1/', /given as a number/],
    ['http://169.254.169.254/latest/meta-data/', /given as a number/],
    ['http://example.com:5432/', /refused port 5432/],
    ['file:///etc/passwd', /refused a file: address/],
  ])('%s', async (url, msg) => {
    await expect(fetchPublicHtml(url)).rejects.toThrow(msg);
  });
});

describe('readFunnelConfig — switched off, not crashed', () => {
  it('lists every missing setting and answers 503', () => {
    try {
      readFunnelConfig({});
      throw new Error('expected a refusal');
    } catch (e) {
      expect((e as { status: number }).status).toBe(503);
      expect((e as Error).message).toMatch(/FUNNEL_REUSE_HOURS is not set.*FUNNEL_IP_HASH_KEY/);
    }
  });
});
