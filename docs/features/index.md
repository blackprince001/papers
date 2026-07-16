# Features — Feature Planning Concepts

Feature-planning documents live here. These are **not** part of the codebase
index (`/architecture.md` and the subtree under it describe the system as
built); this directory holds design/plan docs for upcoming, in-progress, or
recently-shipped features — like the deep-research doc (now implemented).

Each feature plan is an OKF concept with YAML frontmatter (required `type:`
field, typically `type: Feature Plan`). Use a per-feature concept file and
list it below as it is added.

# Plans

* [Deep Research](deep-research.md) - **Implemented.** Multi-step, source-backed research sessions run by an agent on a dedicated Celery `research` queue, resumable via a run-state checkpoint + replayable Redis relay; always-on (no env flag). Originally referenced by the [reformation assessment](/reformation.md).

# Related

* [Architecture overview](/architecture.md) - the system as currently built.
* [Decisions](/decisions/index.md) - ADRs that feature plans may reference.