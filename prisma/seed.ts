import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaClient, CopyStatus, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const isProduction = process.env.NODE_ENV === 'production';
  const allowProdSeed =
    process.argv.includes('--allow-prod-seed') ||
    process.env.ALLOW_PROD_SEED === 'true';

  if (isProduction && !allowProdSeed) {
    console.error(
      '🚨 ABORTED: Seeding in production is blocked by default to prevent data corruption or loss.\n' +
        'To seed missing catalog data in production, you must explicitly pass --allow-prod-seed (or set ALLOW_PROD_SEED=true).\n' +
        'Even with this flag, existing records will NEVER be deleted.',
    );
    process.exit(1);
  }

  console.log('🌱 Starting database seed...');

  if (!isProduction) {
    // Clear existing records in reverse dependency order for repeatability in development/test
    await prisma.copyStatusHistory.deleteMany();
    await prisma.copy.deleteMany();
    await prisma.book.deleteMany();
    await prisma.author.deleteMany();
    await prisma.category.deleteMany();
    console.log('🧹 Existing data cleared.');
  } else {
    console.log(
      '🔒 Production mode detected: Skipping data wipe. Inserting missing records only (non-destructive).',
    );
  }

  // 1. Seed Authors (10 authors)
  const authorsData = [
    { name: 'George Orwell' },
    { name: 'Jane Austen' },
    { name: 'J.R.R. Tolkien' },
    { name: 'Isaac Asimov' },
    { name: 'Mary Shelley' },
    { name: 'Fyodor Dostoevsky' },
    { name: 'Gabriel García Márquez' },
    { name: 'Arthur Conan Doyle' },
    { name: 'Agatha Christie' },
    { name: 'Ursula K. Le Guin' },
  ];

  const authorsMap: Record<string, { id: number }> = {};
  for (const author of authorsData) {
    let authorRecord = await prisma.author.findFirst({
      where: { name: author.name },
    });
    if (!authorRecord) {
      authorRecord = await prisma.author.create({ data: author });
    }
    authorsMap[author.name] = authorRecord;
  }
  console.log(`✅ Seeded ${Object.keys(authorsMap).length} authors.`);

  // 2. Seed Categories (8 categories)
  const categoriesData = [
    { name: 'Classic Fiction' },
    { name: 'Science Fiction' },
    { name: 'Mystery & Detective' },
    { name: 'Fantasy' },
    { name: 'Philosophy & Psychology' },
    { name: 'Historical Fiction' },
    { name: 'Dystopian' },
    { name: 'Adventure' },
  ];

  const categoriesMap: Record<string, { id: number }> = {};
  for (const category of categoriesData) {
    const record = await prisma.category.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    });
    categoriesMap[category.name] = record;
  }
  console.log(`✅ Seeded ${Object.keys(categoriesMap).length} categories.`);

  // 3. Seed Books (30 books with 1-4 copies each)
  const booksData = [
    {
      title: '1984',
      isbn: '978-0451524935',
      description: 'A chilling prophecy about the future and totalitarian rule.',
      publishedYear: 1949,
      authorNames: ['George Orwell'],
      categoryNames: ['Dystopian', 'Classic Fiction'],
      copiesCount: 3,
    },
    {
      title: 'Animal Farm',
      isbn: '978-0451526342',
      description: 'A satire on the Russian Revolution and corruption of power.',
      publishedYear: 1945,
      authorNames: ['George Orwell'],
      categoryNames: ['Classic Fiction', 'Dystopian'],
      copiesCount: 2,
    },
    {
      title: 'Pride and Prejudice',
      isbn: '978-0141439518',
      description: 'A witty romantic tale of manners and marriage in 19th-century England.',
      publishedYear: 1813,
      authorNames: ['Jane Austen'],
      categoryNames: ['Classic Fiction', 'Historical Fiction'],
      copiesCount: 4,
    },
    {
      title: 'Sense and Sensibility',
      isbn: '978-0141439662',
      description: 'The story of two sisters of opposing temperaments finding love.',
      publishedYear: 1811,
      authorNames: ['Jane Austen'],
      categoryNames: ['Classic Fiction'],
      copiesCount: 2,
    },
    {
      title: 'Emma',
      isbn: '978-0141439587',
      description: 'The comedic escapades of a well-meaning matchmaker in Regency England.',
      publishedYear: 1815,
      authorNames: ['Jane Austen'],
      categoryNames: ['Classic Fiction'],
      copiesCount: 1,
    },
    {
      title: 'The Hobbit',
      isbn: '978-0547928227',
      description: 'Bilbo Baggins embarks on a grand journey to reclaim the Lonely Mountain.',
      publishedYear: 1937,
      authorNames: ['J.R.R. Tolkien'],
      categoryNames: ['Fantasy', 'Adventure'],
      copiesCount: 4,
    },
    {
      title: 'The Fellowship of the Ring',
      isbn: '978-0547928210',
      description: 'The first volume of the legendary epic fantasy saga.',
      publishedYear: 1954,
      authorNames: ['J.R.R. Tolkien'],
      categoryNames: ['Fantasy', 'Adventure'],
      copiesCount: 3,
    },
    {
      title: 'The Two Towers',
      isbn: '978-0547928203',
      description: 'The fellowship is broken as the shadows of Mordor grow deeper.',
      publishedYear: 1954,
      authorNames: ['J.R.R. Tolkien'],
      categoryNames: ['Fantasy', 'Adventure'],
      copiesCount: 2,
    },
    {
      title: 'The Return of the King',
      isbn: '978-0547928197',
      description: 'The epic climax of the War of the Ring and the quest to destroy Sauron.',
      publishedYear: 1955,
      authorNames: ['J.R.R. Tolkien'],
      categoryNames: ['Fantasy', 'Adventure'],
      copiesCount: 3,
    },
    {
      title: 'Foundation',
      isbn: '978-0553293357',
      description: 'Hari Seldon uses psychohistory to preserve knowledge across the Galactic Empire.',
      publishedYear: 1951,
      authorNames: ['Isaac Asimov'],
      categoryNames: ['Science Fiction'],
      copiesCount: 3,
    },
    {
      title: 'Foundation and Empire',
      isbn: '978-0553293371',
      description: 'The Foundation faces threats from the remnants of the Empire and the Mule.',
      publishedYear: 1952,
      authorNames: ['Isaac Asimov'],
      categoryNames: ['Science Fiction'],
      copiesCount: 2,
    },
    {
      title: 'Second Foundation',
      isbn: '978-0553293364',
      description: 'The elusive telepathic sanctuary seeks to guide humanity back toward prosperity.',
      publishedYear: 1953,
      authorNames: ['Isaac Asimov'],
      categoryNames: ['Science Fiction'],
      copiesCount: 2,
    },
    {
      title: 'I, Robot',
      isbn: '978-0553382563',
      description: 'A collection of interconnected stories introducing the Three Laws of Robotics.',
      publishedYear: 1950,
      authorNames: ['Isaac Asimov'],
      categoryNames: ['Science Fiction', 'Philosophy & Psychology'],
      copiesCount: 3,
    },
    {
      title: 'Frankenstein',
      isbn: '978-0486282114',
      description: 'Victor Frankenstein creates life with unexpected and tragic consequences.',
      publishedYear: 1818,
      authorNames: ['Mary Shelley'],
      categoryNames: ['Science Fiction', 'Classic Fiction'],
      copiesCount: 4,
    },
    {
      title: 'The Last Man',
      isbn: '978-0199552412',
      description: 'An apocalyptic vision of humanity struggling against an unstoppable plague.',
      publishedYear: 1826,
      authorNames: ['Mary Shelley'],
      categoryNames: ['Science Fiction', 'Dystopian'],
      copiesCount: 1,
    },
    {
      title: 'Crime and Punishment',
      isbn: '978-0140449136',
      description: 'Raskolnikov commits a murder and grapples with crushing psychological guilt.',
      publishedYear: 1866,
      authorNames: ['Fyodor Dostoevsky'],
      categoryNames: ['Classic Fiction', 'Philosophy & Psychology'],
      copiesCount: 3,
    },
    {
      title: 'The Brothers Karamazov',
      isbn: '978-0374528379',
      description: 'A passionate philosophical drama exploring faith, free will, and family betrayal.',
      publishedYear: 1880,
      authorNames: ['Fyodor Dostoevsky'],
      categoryNames: ['Classic Fiction', 'Philosophy & Psychology'],
      copiesCount: 2,
    },
    {
      title: 'Notes from Underground',
      isbn: '978-0679734529',
      description: 'A searing existential examination of alienation and human spite.',
      publishedYear: 1864,
      authorNames: ['Fyodor Dostoevsky'],
      categoryNames: ['Philosophy & Psychology', 'Classic Fiction'],
      copiesCount: 2,
    },
    {
      title: 'The Idiot',
      isbn: '978-0375702242',
      description: 'Prince Myshkin arrives in St. Petersburg as a paragon of goodness.',
      publishedYear: 1869,
      authorNames: ['Fyodor Dostoevsky'],
      categoryNames: ['Classic Fiction'],
      copiesCount: 1,
    },
    {
      title: 'One Hundred Years of Solitude',
      isbn: '978-0060883287',
      description: 'The multi-generational saga of the Buendía family in the town of Macondo.',
      publishedYear: 1967,
      authorNames: ['Gabriel García Márquez'],
      categoryNames: ['Classic Fiction', 'Historical Fiction'],
      copiesCount: 4,
    },
    {
      title: 'Love in the Time of Cholera',
      isbn: '978-0307389732',
      description: 'An unyielding love persists across more than half a century.',
      publishedYear: 1985,
      authorNames: ['Gabriel García Márquez'],
      categoryNames: ['Classic Fiction'],
      copiesCount: 3,
    },
    {
      title: 'Chronicle of a Death Foretold',
      isbn: '978-1400034710',
      description: 'A compelling forensic reconstruction of a murder everyone knew was coming.',
      publishedYear: 1981,
      authorNames: ['Gabriel García Márquez'],
      categoryNames: ['Mystery & Detective', 'Classic Fiction'],
      copiesCount: 2,
    },
    {
      title: 'A Study in Scarlet',
      isbn: '978-0140439083',
      description: 'The first appearance of Sherlock Holmes and Dr. John Watson.',
      publishedYear: 1887,
      authorNames: ['Arthur Conan Doyle'],
      categoryNames: ['Mystery & Detective', 'Adventure'],
      copiesCount: 3,
    },
    {
      title: 'The Sign of the Four',
      isbn: '978-0140439076',
      description: 'Sherlock Holmes investigates a missing treasure and a deadly poison dart.',
      publishedYear: 1890,
      authorNames: ['Arthur Conan Doyle'],
      categoryNames: ['Mystery & Detective'],
      copiesCount: 2,
    },
    {
      title: 'The Hound of the Baskervilles',
      isbn: '978-0141439211',
      description: 'A ghostly hound terrorizes the Dartmoor moors in Holmes\' most famous mystery.',
      publishedYear: 1902,
      authorNames: ['Arthur Conan Doyle'],
      categoryNames: ['Mystery & Detective'],
      copiesCount: 4,
    },
    {
      title: 'And Then There Were None',
      isbn: '978-0062073488',
      description: 'Ten strangers are lured to an isolated island and accused of past crimes.',
      publishedYear: 1939,
      authorNames: ['Agatha Christie'],
      categoryNames: ['Mystery & Detective'],
      copiesCount: 4,
    },
    {
      title: 'Murder on the Orient Express',
      isbn: '978-0062693662',
      description: 'Hercule Poirot must solve a homicide aboard an exotic snowbound train.',
      publishedYear: 1934,
      authorNames: ['Agatha Christie'],
      categoryNames: ['Mystery & Detective'],
      copiesCount: 3,
    },
    {
      title: 'The Murder of Roger Ackroyd',
      isbn: '978-0062073563',
      description: 'A groundbreaking mystery featuring Poirot and an unforgettable twist.',
      publishedYear: 1926,
      authorNames: ['Agatha Christie'],
      categoryNames: ['Mystery & Detective'],
      copiesCount: 2,
    },
    {
      title: 'The Left Hand of Darkness',
      isbn: '978-0441478125',
      description: 'An envoy travels to the winter planet Gethen to foster interstellar union.',
      publishedYear: 1969,
      authorNames: ['Ursula K. Le Guin'],
      categoryNames: ['Science Fiction', 'Philosophy & Psychology'],
      copiesCount: 3,
    },
    {
      title: 'The Dispossessed',
      isbn: '978-0061054884',
      description: 'A physicist travels between an anarchist moon and a capitalist homeworld.',
      publishedYear: 1974,
      authorNames: ['Ursula K. Le Guin'],
      categoryNames: ['Science Fiction', 'Dystopian'],
      copiesCount: 2,
    },
  ];

  let totalCopies = 0;
  for (let bookIndex = 0; bookIndex < booksData.length; bookIndex++) {
    const book = booksData[bookIndex];
    let targetBook = await prisma.book.findUnique({
      where: { isbn: book.isbn },
      include: { copies: true },
    });

    if (!targetBook) {
      targetBook = await prisma.book.create({
        data: {
          title: book.title,
          isbn: book.isbn,
          description: book.description,
          publishedYear: book.publishedYear,
          authors: {
            connect: book.authorNames.map((name) => ({ id: authorsMap[name].id })),
          },
          categories: {
            connect: book.categoryNames.map((name) => ({ id: categoriesMap[name].id })),
          },
          copies: {
            create: Array.from({ length: book.copiesCount }, (_, cIndex) => ({
              barcode: `BD-${String(bookIndex + 1).padStart(3, '0')}-${String(cIndex + 1).padStart(3, '0')}`,
              status: CopyStatus.AVAILABLE,
              shelfLocation: `STACK-${String(bookIndex + 1).padStart(2, '0')}`,
            })),
          },
        },
        include: {
          copies: true,
        },
      });
      totalCopies += targetBook.copies.length;

      // Seed initial history for each copy
      for (const copy of targetBook.copies) {
        await prisma.copyStatusHistory.create({
          data: {
            copyId: copy.id,
            fromStatus: null,
            toStatus: CopyStatus.AVAILABLE,
            reason: 'Initial copy inventory',
          },
        });
      }
    } else {
      // Book already exists (e.g. in production): insert any missing copies
      const existingCopiesCount = targetBook.copies.length;
      const missingCopies = Math.max(0, book.copiesCount - existingCopiesCount);
      for (let i = 0; i < missingCopies; i++) {
        const newCopy = await prisma.copy.create({
          data: {
            bookId: targetBook.id,
            barcode: `BD-${String(bookIndex + 1).padStart(3, '0')}-${String(existingCopiesCount + i + 1).padStart(3, '0')}`,
            status: CopyStatus.AVAILABLE,
            shelfLocation: `STACK-${String(bookIndex + 1).padStart(2, '0')}`,
          },
        });
        await prisma.copyStatusHistory.create({
          data: {
            copyId: newCopy.id,
            fromStatus: null,
            toStatus: CopyStatus.AVAILABLE,
            reason: 'Initial copy inventory',
          },
        });
      }
      totalCopies += existingCopiesCount + missingCopies;
    }
  }

  // 3b. Seed Demo Status States (LOST, DAMAGED, RETIRED) in development/test environments
  if (!isProduction) {
    console.log('🔄 Setting up demo states (LOST, DAMAGED, RETIRED)...');

    // First book (1984) copies: mark copy 2 as LOST, copy 3 as DAMAGED
    const book1984 = await prisma.book.findUnique({
      where: { isbn: '978-0451524935' },
      include: { copies: { orderBy: { id: 'asc' } } },
    });

    if (book1984 && book1984.copies.length >= 3) {
      const lostCopy = book1984.copies[1];
      await prisma.copy.update({
        where: { id: lostCopy.id },
        data: { status: CopyStatus.LOST },
      });
      await prisma.copyStatusHistory.create({
        data: {
          copyId: lostCopy.id,
          fromStatus: CopyStatus.AVAILABLE,
          toStatus: CopyStatus.LOST,
          reason: 'Reported lost by member',
        },
      });

      const damagedCopy = book1984.copies[2];
      await prisma.copy.update({
        where: { id: damagedCopy.id },
        data: {
          status: CopyStatus.DAMAGED,
          shelfLocation: 'REPAIR-BENCH',
          notes: 'Water damage and torn cover',
        },
      });
      await prisma.copyStatusHistory.create({
        data: {
          copyId: damagedCopy.id,
          fromStatus: CopyStatus.AVAILABLE,
          toStatus: CopyStatus.DAMAGED,
          reason: 'Spine torn and water damaged; sent to repair bench',
        },
      });
    }

    // Second book (Animal Farm) copy 2: mark as RETIRED
    const bookAnimalFarm = await prisma.book.findUnique({
      where: { isbn: '978-0451526342' },
      include: { copies: { orderBy: { id: 'asc' } } },
    });

    if (bookAnimalFarm && bookAnimalFarm.copies.length >= 2) {
      const retiredCopy = bookAnimalFarm.copies[1];
      await prisma.copy.update({
        where: { id: retiredCopy.id },
        data: {
          retiredAt: new Date(),
          notes: 'Damaged beyond repair; retired from circulation',
        },
      });
      await prisma.copyStatusHistory.create({
        data: {
          copyId: retiredCopy.id,
          fromStatus: CopyStatus.AVAILABLE,
          toStatus: CopyStatus.AVAILABLE,
          reason: 'Worn beyond repair; permanently retired from circulation',
        },
      });
    }

    console.log('✅ Demo copy states configured (LOST, DAMAGED, RETIRED).');
  }

  console.log(`✅ Successfully seeded ${booksData.length} books and ${totalCopies} copies.`);
  
  // 4. Seed Demo Users (ADMIN, LIBRARIAN, MEMBER)
  if (process.env.NODE_ENV !== 'production') {
    console.log('👤 Seeding demo users...');

    const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@bookdrop.local').trim().toLowerCase();
    const librarianEmail = (process.env.SEED_LIBRARIAN_EMAIL || 'librarian@bookdrop.local').trim().toLowerCase();
    const memberEmail = (process.env.SEED_MEMBER_EMAIL || 'member@bookdrop.local').trim().toLowerCase();

    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'AdminPassword123!';
    const librarianPassword = process.env.SEED_LIBRARIAN_PASSWORD || 'LibrarianPassword123!';
    const memberPassword = process.env.SEED_MEMBER_PASSWORD || 'MemberPassword123!';

    const [adminHash, librarianHash, memberHash] = await Promise.all([
      argon2.hash(adminPassword),
      argon2.hash(librarianPassword),
      argon2.hash(memberPassword),
    ]);

    const demoUsers = [
      {
        email: adminEmail,
        name: 'Demo Admin',
        role: Role.ADMIN,
        passwordHash: adminHash,
      },
      {
        email: librarianEmail,
        name: 'Demo Librarian',
        role: Role.LIBRARIAN,
        passwordHash: librarianHash,
      },
      {
        email: memberEmail,
        name: 'Demo Member',
        role: Role.MEMBER,
        passwordHash: memberHash,
      },
    ];

    for (const user of demoUsers) {
      await prisma.user.upsert({
        where: { email: user.email },
        update: {
          name: user.name,
          role: user.role,
          passwordHash: user.passwordHash,
        },
        create: user,
      });
    }

    console.log(`✅ Seeded ${demoUsers.length} demo users (ADMIN, LIBRARIAN, MEMBER).`);
  } else {
    console.log('🔒 Production mode detected: Skipping demo users seed.');
  }

  console.log('✨ Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
