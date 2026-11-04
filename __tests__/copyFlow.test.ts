import {copyAddress} from '../src/anyChain/copyFlow';

describe('copyAddress (the "Copy / share address" button)', () => {
  it('reports ok when the copy worked and does not select anything', async () => {
    const select = jest.fn();
    expect(await copyAddress('0xabc', async () => undefined, select)).toBe('ok');
    expect(select).not.toHaveBeenCalled();
  });

  it('reports failed and selects the address when copying fails, instead of failing silently (the old button swallowed it)', async () => {
    const select = jest.fn();
    const share = jest.fn().mockRejectedValue(new Error('copy failed'));
    expect(await copyAddress('0xabc', share, select)).toBe('failed');
    expect(share).toHaveBeenCalledWith('0xabc');
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('still reports failed when selecting the text also throws', async () => {
    const result = await copyAddress('0xabc', async () => { throw new Error('x'); }, () => { throw new Error('no dom'); });
    expect(result).toBe('failed');
  });

  it('a share that throws synchronously is a failure too', async () => {
    const select = jest.fn();
    expect(await copyAddress('0xabc', () => { throw new Error('sync'); }, select)).toBe('failed');
    expect(select).toHaveBeenCalled();
  });
});
