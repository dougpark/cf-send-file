---
mode: agent
description: "Use when fixing a UI bug, conditional display issue, or small frontend behavior change in this repo. Include the screen, exact behavior, acceptance criteria, and edge cases."
---

Fix the UI issue in this repo.

Requirements:
1. Identify the affected screen or component.
2. Understand the expected behavior and the current bug.
3. Make the smallest possible fix that addresses the root cause.
4. Preserve other behaviors unless the request explicitly changes them.
5. Handle blank, missing, and default-state values explicitly.
6. Keep mobile-first behavior consistent with the desktop layout where relevant.
7. Verify with the smallest relevant check after the change.

Include the following in your response:
- the file(s) changed
- the exact behavior that was fixed
- any edge cases considered
- the verification command or check you ran

If the request is ambiguous, ask one clarifying question before editing.
