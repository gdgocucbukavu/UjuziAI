# Firestore Schema Design

## Collections

### `users` (Collection)
```
users/{userId}
├── uid: string
├── email: string
├── displayName: string
├── role: 'student' | 'admin'
├── createdAt: Timestamp
├── updatedAt: Timestamp
├── totalScore: number           // Cumulative score across all modules
├── completedModules: string[]   // Array of completed module IDs
├── badges: string[]             // Array of earned badge IDs
├── rank: number | null          // Global leaderboard rank
│
├── progress/{moduleId}          // Subcollection
│   ├── moduleId: string
│   ├── submissionId: string | null
│   ├── submitted: boolean
│   ├── submittedAt: Timestamp | null
│   ├── validated: boolean       // Admin validated the submission
│   ├── examUnlocked: boolean
│   ├── examScore: number | null // Final exam score (0-10)
│   ├── examAttempts: number     // Counter (max 2)
│   ├── examLocked: boolean      // Locked due to violations
│   ├── badgeId: string | null   // Unique verifiable badge ID
│   ├── completedAt: Timestamp | null
│   ├── lastExamAt: Timestamp | null
│   ├── reviewedAt: Timestamp | null
│   └── reviewedBy: string | null
│
└── submissions/{submissionId}   // Subcollection
    ├── userId: string
    ├── moduleId: string
    ├── images: string[]         // Firebase Storage URLs
    ├── videoUrl: string | null
    ├── description: string
    ├── status: 'pending' | 'approved' | 'rejected'
    ├── submittedAt: Timestamp
    ├── reviewedAt: Timestamp | null
    └── reviewedBy: string | null
```

### `exams` (Collection)
```
exams/{examId}
├── userId: string
├── moduleId: string
├── startedAt: Timestamp
├── completedAt: Timestamp | null
├── status: 'in-progress' | 'completed' | 'graded'
├── answers: Array
│   └── [index]
│       ├── answer: any          // MCQ index or open text
│       ├── questionType: 'mcq' | 'open'
│       └── submittedAt: string
├── mcqScore: number | null      // Score out of 10
├── openScore: number | null     // Score out of 10
├── totalScore: number | null    // Average of mcq + open
├── aiCheatingFlags: number      // AI cheating detection count
├── evaluationDetails: Object    // Detailed grading breakdown
└── gradedAt: Timestamp | null
```

### `moduleSettings` (Collection)
```
moduleSettings/{moduleId}
├── isOpen: boolean              // Admin can open/close codelabs
├── updatedAt: Timestamp
└── customConfig: Object | null  // Optional per-module settings
```

### `badges` (Collection) - For public verification
```
badges/{badgeId}
├── userId: string
├── moduleId: string
├── score: number
├── issuedAt: Timestamp
└── verified: boolean
```

### `buildathons` (Collection)
```
buildathons/{buildathonId}
├── type: 'buildathon' | 'hackathon'
├── title: string
├── description: string
├── startDate: string (ISO or datetime-local)
├── endDate: string (ISO or datetime-local)
├── workDuration: string
├── maxTeamSize: number
├── prizes: Array<{ place, rewardType, points, label }>
├── participants: string[]
├── status: 'active' | 'completed' | ...
├── finalized: boolean
├── createdBy: string
├── createdAt: Timestamp
├── updatedAt: Timestamp
├── archivedAt: Timestamp | null
├── publishedAt: Timestamp | null
├── publicationStatus: 'published' | 'draft' | 'archived'
├── votingEnabled: boolean
├── maxVotesPerUser: number
├── allowSelfVote: boolean
├── voteStartDate: string | null
├── voteEndDate: string | null
├── projectVisibility: 'published-only' | 'all-submitted'
└── submissionOpen: boolean
```

### `buildathonProjects` (Collection)
```
buildathonProjects/{projectId}
├── buildathonId: string
├── title: string
├── description: string
├── category: string
├── teamName: string
├── repoUrl: string
├── demoUrl: string
├── members: Array<{ uid, name, email }>
├── submittedBy: string
├── submittedAt: Timestamp
├── votes: string[]
├── voteCount: number
├── likesCount: number
├── commentsCount: number
├── feedbackCount: number
├── likeUserIds: string[]
├── projectStatus: 'brouillon' | 'soumis' | 'valide' | 'rejete' | 'publie'
├── moderationStatus: 'pending' | 'approved' | 'rejected'
├── moderationNote: string
├── isPublished: boolean
├── isPublic: boolean
├── validatedAt: Timestamp | null
├── validatedBy: string | null
├── rejectedAt: Timestamp | null
├── rejectedBy: string | null
├── publishedAt: Timestamp | null
└── publishedBy: string | null
```

## Indexes Required

1. `exams` - userId (ASC) + moduleId (ASC) + startedAt (DESC)
2. `users` - totalScore (DESC) for leaderboard
3. `users/{uid}/progress` - examScore (DESC)

## Security Model

- Users can only read/write their own data
- Admin role verified via Firestore user document
- Exam attempt counter is server-enforced
- Badge IDs are unique UUIDs generated server-side
- Progress updates are restricted (no client can set examScore)
