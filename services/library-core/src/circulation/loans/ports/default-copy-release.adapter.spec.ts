import { CopyStatus } from '@prisma/client';
import { DefaultCopyReleaseAdapter } from './default-copy-release.adapter';
import { CopiesService } from '../../copies/copies.service';

describe('DefaultCopyReleaseAdapter (Unit Tests)', () => {
  let adapter: DefaultCopyReleaseAdapter;
  let copiesServiceMock: jest.Mocked<CopiesService>;

  beforeEach(() => {
    copiesServiceMock = {
      transitionStatus: jest.fn(),
    } as unknown as jest.Mocked<CopiesService>;

    adapter = new DefaultCopyReleaseAdapter(copiesServiceMock);
  });

  it('transitions copy from BORROWED to AVAILABLE inside the provided transaction', async () => {
    const fakeTx: any = { copy: {} };

    await adapter.release(101, fakeTx);

    expect(copiesServiceMock.transitionStatus).toHaveBeenCalledWith(
      101,
      [CopyStatus.BORROWED],
      CopyStatus.AVAILABLE,
      { reason: 'Loan returned in good condition' },
      fakeTx,
    );
  });
});
