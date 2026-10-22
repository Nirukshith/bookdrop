import { Test, TestingModule } from '@nestjs/testing';
import { HoldSource, HoldStatus, Role } from '@prisma/client';
import { HoldsResolver } from './holds.resolver';
import { HoldsService } from './holds.service';
import { CopiesService } from '../copies/copies.service';
import { HoldsDataLoader } from './holds.loader';
import { AuthenticatedUser } from '../../auth';

describe('HoldsResolver (GraphQL Presentation & Field Authorization)', () => {
  let resolver: HoldsResolver;
  let holdsServiceMock: any;
  let copiesServiceMock: any;
  let dataLoaderMock: any;

  const mockMemberUser: AuthenticatedUser = {
    sub: 42,
    email: 'member@example.com',
    role: Role.MEMBER,
  };

  const mockStaffUser: AuthenticatedUser = {
    sub: 99,
    email: 'librarian@example.com',
    role: Role.LIBRARIAN,
  };

  const mockHold = {
    id: 1,
    userId: 42,
    bookId: 101,
    copyId: 5,
    status: HoldStatus.ACTIVE,
    source: HoldSource.REQUEST,
    expiresAt: new Date('2026-10-22T10:00:00.000Z'),
    createdAt: new Date('2026-10-21T10:00:00.000Z'),
    resolvedAt: null,
    resolvedNote: null,
  };

  beforeEach(async () => {
    holdsServiceMock = {
      requestHold: jest.fn().mockResolvedValue(mockHold),
      cancelHold: jest.fn().mockResolvedValue({
        ...mockHold,
        status: HoldStatus.CANCELLED,
      }),
      listMemberHolds: jest.fn().mockResolvedValue([mockHold]),
      listHolds: jest.fn().mockResolvedValue({ items: [mockHold], total: 1 }),
      getHold: jest.fn().mockResolvedValue(mockHold),
    };

    copiesServiceMock = {
      findById: jest.fn().mockResolvedValue({
        id: 5,
        barcode: 'BD-101-001',
      }),
    };

    dataLoaderMock = {
      loadBookTitle: jest.fn().mockResolvedValue('The Great Gatsby'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HoldsResolver,
        { provide: HoldsService, useValue: holdsServiceMock },
        { provide: CopiesService, useValue: copiesServiceMock },
        { provide: HoldsDataLoader, useValue: dataLoaderMock },
      ],
    }).compile();

    resolver = module.get<HoldsResolver>(HoldsResolver);
  });

  describe('Member Mutations & Queries', () => {
    it('requestHold calls service with member ID', async () => {
      const result = await resolver.requestHold(101, mockMemberUser);

      expect(result).toEqual(mockHold);
      expect(holdsServiceMock.requestHold).toHaveBeenCalledWith(42, 101);
    });

    it('cancelMyHold forwards member ID and role to service', async () => {
      const result = await resolver.cancelMyHold(1, mockMemberUser);

      expect(result.status).toBe(HoldStatus.CANCELLED);
      expect(holdsServiceMock.cancelHold).toHaveBeenCalledWith(1, {
        id: 42,
        role: Role.MEMBER,
      });
    });

    it('myHolds queries only for authenticated member holds', async () => {
      const result = await resolver.myHolds(mockMemberUser, HoldStatus.ACTIVE);

      expect(result).toEqual([mockHold]);
      expect(holdsServiceMock.listMemberHolds).toHaveBeenCalledWith(
        42,
        HoldStatus.ACTIVE,
      );
    });
  });

  describe('Staff Mutations & Queries', () => {
    it('cancelHold passes staff credentials and reason to service', async () => {
      await resolver.cancelHold(1, 'Defective copy', mockStaffUser);

      expect(holdsServiceMock.cancelHold).toHaveBeenCalledWith(
        1,
        { id: 99, role: Role.LIBRARIAN },
        'Defective copy',
      );
    });

    it('getHolds queries with filters and pagination', async () => {
      const result = await resolver.getHolds(
        { status: HoldStatus.ACTIVE },
        { skip: 0, take: 10 },
      );

      expect(result).toEqual([mockHold]);
      expect(holdsServiceMock.listHolds).toHaveBeenCalledWith(
        { status: HoldStatus.ACTIVE },
        { skip: 0, take: 10 },
      );
    });

    it('getHold retrieves single hold by ID', async () => {
      const result = await resolver.getHold(1);

      expect(result).toEqual(mockHold);
      expect(holdsServiceMock.getHold).toHaveBeenCalledWith(1);
    });
  });

  describe('Field Resolvers', () => {
    it('resolveBookTitle delegates to DataLoader', async () => {
      const title = await resolver.resolveBookTitle(mockHold);

      expect(title).toBe('The Great Gatsby');
      expect(dataLoaderMock.loadBookTitle).toHaveBeenCalledWith(101);
    });

    describe('resolveCopyBarcode (Field Authorization & Concealment)', () => {
      it('returns NULL when caller is a MEMBER (redacts barcode)', async () => {
        const barcode = await resolver.resolveCopyBarcode(
          mockHold,
          mockMemberUser,
        );

        expect(barcode).toBeNull();
        expect(copiesServiceMock.findById).not.toHaveBeenCalled();
      });

      it('returns NULL when unauthenticated', async () => {
        const barcode = await resolver.resolveCopyBarcode(mockHold, undefined);

        expect(barcode).toBeNull();
        expect(copiesServiceMock.findById).not.toHaveBeenCalled();
      });

      it('returns barcode when caller is LIBRARIAN', async () => {
        const barcode = await resolver.resolveCopyBarcode(
          mockHold,
          mockStaffUser,
        );

        expect(barcode).toBe('BD-101-001');
        expect(copiesServiceMock.findById).toHaveBeenCalledWith(5);
      });

      it('uses existing copy.barcode if already joined on parent hold for staff', async () => {
        const holdWithCopy = {
          ...mockHold,
          copy: { barcode: 'BD-PRELOADED-01' },
        };

        const barcode = await resolver.resolveCopyBarcode(
          holdWithCopy,
          mockStaffUser,
        );

        expect(barcode).toBe('BD-PRELOADED-01');
        expect(copiesServiceMock.findById).not.toHaveBeenCalled();
      });
    });
  });
});
