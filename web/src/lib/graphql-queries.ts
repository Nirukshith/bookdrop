export const LOGIN_MUTATION = `
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      accessToken
      refreshToken
      user {
        id
        email
        name
        role
        createdAt
      }
    }
  }
`;

export const REGISTER_MUTATION = `
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      accessToken
      refreshToken
      user {
        id
        email
        name
        role
        createdAt
      }
    }
  }
`;

export const ME_QUERY = `
  query Me {
    me {
      id
      email
      name
      role
      createdAt
    }
  }
`;

export const BOOKS_QUERY = `
  query Books($search: String, $skip: Int, $take: Int) {
    books(search: $search, skip: $skip, take: $take) {
      id
      title
      isbn
      publishedYear
      description
      replacementPriceRs
      availableCopies
      availableCopiesCount
      queueLength
      authors {
        id
        name
      }
      categories {
        id
        name
      }
      createdAt
    }
  }
`;

export const BOOK_QUERY = `
  query Book($id: Int!) {
    book(id: $id) {
      id
      title
      isbn
      publishedYear
      description
      replacementPriceRs
      availableCopies
      availableCopiesCount
      queueLength
      authors {
        id
        name
      }
      categories {
        id
        name
      }
    }
  }
`;

export const REQUEST_HOLD_MUTATION = `
  mutation RequestHold($bookId: Int!) {
    requestHold(bookId: $bookId) {
      id
      userId
      bookId
      copyId
      bookTitle
      copyBarcode
      status
      source
      expiresAt
      createdAt
    }
  }
`;

export const CANCEL_MY_HOLD_MUTATION = `
  mutation CancelMyHold($holdId: Int!) {
    cancelMyHold(holdId: $holdId) {
      id
      status
    }
  }
`;

export const JOIN_QUEUE_MUTATION = `
  mutation JoinQueue($bookId: Int!) {
    joinReservationQueue(bookId: $bookId) {
      id
      bookId
      status
      position
      createdAt
    }
  }
`;

export const CANCEL_RESERVATION_MUTATION = `
  mutation CancelReservation($reservationId: Int!, $reason: String) {
    cancelReservation(reservationId: $reservationId, reason: $reason) {
      id
      status
      cancelledAt
    }
  }
`;

export const MY_LOANS_QUERY = `
  query MyLoans($status: LoanStatus) {
    myLoans(status: $status) {
      id
      bookId
      bookTitle
      copyId
      copyBarcode
      borrowedAt
      dueAt
      returnedAt
      status
      daysRemaining
      daysLate
      isOverdue
      accruedLateFeeRs
      returnCondition
      conditionNote
      createdAt
    }
  }
`;

export const MY_HOLDS_QUERY = `
  query MyHolds($status: HoldStatus) {
    myHolds(status: $status) {
      id
      bookId
      bookTitle
      copyId
      copyBarcode
      status
      source
      expiresAt
      resolvedAt
      createdAt
    }
  }
`;

export const MY_RESERVATIONS_QUERY = `
  query MyReservations {
    myReservations {
      id
      bookId
      status
      position
      createdAt
      promotedAt
      holdId
      book {
        id
        title
      }
    }
  }
`;

export const MY_FINES_QUERY = `
  query MyFines($status: FineStatus) {
    myFines(status: $status) {
      id
      bookTitle
      originalAmountRs
      paidAmountRs
      outstandingAmountRs
      status
      reason
      capRs
      createdAt
    }
  }
`;

export const MY_NOTIFICATIONS_QUERY = `
  query MyNotifications($pagination: NotificationPaginationInput) {
    myNotifications(pagination: $pagination) {
      id
      template
      status
      sentAt
      createdAt
    }
  }
`;

export const MY_MISSED_PICKUPS_QUERY = `
  query MyMissedPickups {
    myMissedPickups {
      unassessedCount
      threshold
      recent {
        holdId
        bookTitle
        expiredAt
      }
    }
  }
`;

export const PICKUP_DESK_HOLDS_QUERY = `
  query PickupDeskHolds($copyBarcode: String, $memberEmail: String) {
    pickupDeskHolds(copyBarcode: $copyBarcode, memberEmail: $memberEmail) {
      id
      userId
      memberName
      bookId
      bookTitle
      copyId
      copyBarcode
      pickupDeadline
      createdAt
    }
  }
`;

export const CONFIRM_PICKUP_MUTATION = `
  mutation ConfirmPickup($copyBarcode: String!, $holdId: Int!) {
    confirmPickup(copyBarcode: $copyBarcode, holdId: $holdId) {
      id
      bookTitle
      copyBarcode
      dueAt
      status
    }
  }
`;

export const CHECKOUT_COPY_MUTATION = `
  mutation CheckoutCopy($copyBarcode: String!, $memberEmail: String!) {
    checkoutCopy(copyBarcode: $copyBarcode, memberEmail: $memberEmail) {
      id
      bookTitle
      copyBarcode
      dueAt
      status
    }
  }
`;

export const RETURN_LOAN_MUTATION = `
  mutation ReturnLoan($copyBarcode: String!, $condition: ReturnCondition!, $conditionNote: String, $damageFeeRs: Float) {
    returnLoan(copyBarcode: $copyBarcode, condition: $condition, conditionNote: $conditionNote, damageFeeRs: $damageFeeRs) {
      id
      bookTitle
      copyBarcode
      returnedAt
      returnCondition
      accruedLateFeeRs
      status
    }
  }
`;

export const COPIES_QUERY = `
  query Copies($bookId: Int, $status: CopyStatus, $includeRetired: Boolean, $skip: Int, $take: Int) {
    copies(bookId: $bookId, status: $status, includeRetired: $includeRetired, skip: $skip, take: $take) {
      id
      bookId
      barcode
      shelfLocation
      status
      notes
      retiredAt
      createdAt
    }
  }
`;

export const ADD_COPY_MUTATION = `
  mutation AddCopy($input: AddCopyInput!) {
    addCopy(input: $input) {
      id
      barcode
      bookId
      shelfLocation
      status
    }
  }
`;

export const RETIRE_COPY_MUTATION = `
  mutation RetireCopy($id: Int!, $reason: String) {
    retireCopy(id: $id, reason: $reason) {
      id
      barcode
      status
      retiredAt
    }
  }
`;

export const CREATE_BOOK_MUTATION = `
  mutation CreateBook($input: CreateBookInput!) {
    createBook(input: $input) {
      id
      title
      isbn
      publishedYear
    }
  }
`;

export const JOB_STATUSES_QUERY = `
  query JobStatuses {
    jobStatuses {
      name
      isLeased
      lockedBy
      lockedUntil
      lastStartedAt
      lastFinishedAt
      lastStatus
      lastStats
      lastError
    }
  }
`;

export const RUN_JOB_MUTATION = `
  mutation RunJob($name: String!) {
    runJob(name: $name) {
      jobName
      success
      durationMs
      stats
      error
    }
  }
`;

export const RETRY_NOTIFICATION_MUTATION = `
  mutation RetryNotification($id: Int!) {
    retryNotification(id: $id) {
      id
      template
      status
      sentAt
    }
  }
`;

export const MEMBER_FINES_QUERY = `
  query MemberFines($memberEmail: String!, $status: FineStatus) {
    memberFines(memberEmail: $memberEmail, status: $status) {
      id
      loanId
      amountRs
      paidRs
      outstandingRs
      status
      reason
      capRs
      note
      createdAt
    }
  }
`;

export const RECORD_FINE_PAYMENT_MUTATION = `
  mutation RecordFinePayment($fineId: ID!, $amountRs: Float!, $note: String) {
    recordFinePayment(fineId: $fineId, amountRs: $amountRs, note: $note) {
      id
      amountRs
      paidRs
      outstandingRs
      status
    }
  }
`;

export const WAIVE_FINE_MUTATION = `
  mutation WaiveFine($fineId: ID!, $reason: String!) {
    waiveFine(fineId: $fineId, reason: $reason) {
      id
      status
    }
  }
`;

