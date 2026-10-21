import { Test, TestingModule } from '@nestjs/testing';
import { CopyStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../auth';
import { CopiesResolver } from './copies.resolver';
import { CopiesService } from './copies.service';
import { CopyModel } from './models/copy.model';

describe('CopiesResolver', () => {
  let resolver: CopiesResolver;
  let serviceMock: any;

  const mockUser: AuthenticatedUser = {
    sub: 99,
    email: 'librarian@bookdrop.local',
    role: 'LIBRARIAN',
  };

  const mockCopy: CopyModel = {
    id: 1,
    bookId: 10,
    barcode: 'BD-000001',
    status: CopyStatus.AVAILABLE,
    shelfLocation: 'ROW-1',
    notes: 'Good',
    retiredAt: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    serviceMock = {
      addCopy: jest.fn(),
      addCopies: jest.fn(),
      updateCopy: jest.fn(),
      changeStatus: jest.fn(),
      retireCopy: jest.fn(),
      listCopies: jest.fn(),
      findById: jest.fn(),
      findByBarcode: jest.fn(),
      getStatusHistory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CopiesResolver,
        { provide: CopiesService, useValue: serviceMock },
      ],
    }).compile();

    resolver = module.get<CopiesResolver>(CopiesResolver);
  });

  describe('Mutations', () => {
    it('calls addCopy with input and user id', async () => {
      serviceMock.addCopy.mockResolvedValue(mockCopy);

      const result = await resolver.addCopy(
        { bookId: 10, barcode: 'BD-000001', shelfLocation: 'ROW-1' },
        mockUser,
      );

      expect(serviceMock.addCopy).toHaveBeenCalledWith(
        10,
        'BD-000001',
        'ROW-1',
        undefined,
        99,
      );
      expect(result).toEqual(mockCopy);
    });

    it('calls addCopies with quantity, shelfLocation, and actor id', async () => {
      serviceMock.addCopies.mockResolvedValue([mockCopy]);

      const result = await resolver.addCopies(10, 5, 'ROW-1', mockUser);

      expect(serviceMock.addCopies).toHaveBeenCalledWith(10, 5, 'ROW-1', 99);
      expect(result).toHaveLength(1);
    });

    it('calls updateCopy with id and fields', async () => {
      serviceMock.updateCopy.mockResolvedValue(mockCopy);

      const result = await resolver.updateCopy(1, { shelfLocation: 'STACK-9' });

      expect(serviceMock.updateCopy).toHaveBeenCalledWith(
        1,
        'STACK-9',
        undefined,
      );
      expect(result).toEqual(mockCopy);
    });

    it('calls changeCopyStatus with id, to status, reason, and actor id', async () => {
      serviceMock.changeStatus.mockResolvedValue({
        ...mockCopy,
        status: CopyStatus.LOST,
      });

      const result = await resolver.changeCopyStatus(
        1,
        CopyStatus.LOST,
        'Misplaced by patron',
        mockUser,
      );

      expect(serviceMock.changeStatus).toHaveBeenCalledWith(
        1,
        CopyStatus.LOST,
        'Misplaced by patron',
        99,
      );
      expect(result.status).toBe(CopyStatus.LOST);
    });

    it('calls retireCopy with id, reason, and actor id', async () => {
      serviceMock.retireCopy.mockResolvedValue({
        ...mockCopy,
        retiredAt: new Date(),
      });

      const result = await resolver.retireCopy(
        1,
        'Damaged beyond repair',
        mockUser,
      );

      expect(serviceMock.retireCopy).toHaveBeenCalledWith(
        1,
        'Damaged beyond repair',
        99,
      );
      expect(result.retiredAt).toBeDefined();
    });
  });

  describe('Queries', () => {
    it('calls listCopies with filter args', async () => {
      serviceMock.listCopies.mockResolvedValue([mockCopy]);

      const result = await resolver.getCopies({
        bookId: 10,
        take: 10,
        skip: 0,
      });

      expect(serviceMock.listCopies).toHaveBeenCalledWith({
        bookId: 10,
        take: 10,
        skip: 0,
      });
      expect(result).toHaveLength(1);
    });

    it('calls findById for single copy query', async () => {
      serviceMock.findById.mockResolvedValue(mockCopy);

      const result = await resolver.getCopy(1);

      expect(serviceMock.findById).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockCopy);
    });

    it('calls findByBarcode for copyByBarcode query', async () => {
      serviceMock.findByBarcode.mockResolvedValue(mockCopy);

      const result = await resolver.getCopyByBarcode('BD-000001');

      expect(serviceMock.findByBarcode).toHaveBeenCalledWith('BD-000001');
      expect(result).toEqual(mockCopy);
    });

    it('calls getStatusHistory for copyStatusHistory query', async () => {
      const mockHistory = [
        {
          id: 1,
          copyId: 1,
          fromStatus: null,
          toStatus: CopyStatus.AVAILABLE,
          reason: 'Initial',
          changedById: 99,
          createdAt: new Date(),
        },
      ];
      serviceMock.getStatusHistory.mockResolvedValue(mockHistory);

      const result = await resolver.getCopyStatusHistory(1);

      expect(serviceMock.getStatusHistory).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockHistory);
    });
  });
});
