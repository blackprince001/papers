# Features — Feature Planning Concepts

Feature-planning documents live here. These are **not** part of the codebase
index (`/architecture.md` and the subtree under it describe the system as
built); this directory holds design/plan docs for upcoming, in-progress, or
recently-shipped features — like the deep-research doc (now implemented).

Each feature plan is an OKF concept with YAML frontmatter (required `type:`
field, typically `type: Feature Plan`). Use a per-feature concept file and
list it below as it is added.

# Plans

* [Reader and AI Experience Reformation](reader-ai-experience.md) - **In progress.** Gated plan for reader improvements and the deep-research lifecycle rewrite. The mutation freeze remains until its safety and evaluation gates pass.
* [Deep Research](deep-research.md) - **Implemented, replacement planned.** The current agent/Celery/Redis implementation; known security, resumability, evidence, worker-isolation, and test gaps are addressed by the [reformation plan](reader-ai-experience.md).

# Related

* [Architecture overview](/architecture.md) - the system as currently built.
* [Decisions](/decisions/index.md) - ADRs that feature plans may reference.