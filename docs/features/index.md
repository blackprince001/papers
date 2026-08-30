# Features — Feature Planning Concepts

Feature-planning documents live here. These are **not** part of the codebase
index (`/architecture.md` and the subtree under it describe the system as
built); this directory holds design/plan docs for upcoming, in-progress, or
recently-shipped features — like the deep-research doc (now implemented).

Each feature plan is an OKF concept with YAML frontmatter (required `type:`
field, typically `type: Feature Plan`). Use a per-feature concept file and
list it below as it is added.

# Plans

* [Reader and AI Experience Reformation](reader-ai-experience.md) - **Complete.** The reader and deep-research lifecycle work is shipped; visual verification remains a product review checkpoint.
* [Deep Research](deep-research.md) - **Implemented.** The agent/Celery/Postgres implementation with evidence verification, follow-ups, cancellation, archive search, and release operations.

# Related

* [Architecture overview](/architecture.md) - the system as currently built.
* [Decisions](/decisions/index.md) - ADRs that feature plans may reference.
