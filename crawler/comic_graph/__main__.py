"""支持 `python -m comic_graph` 运行。"""

from __future__ import annotations

from .run import main

if __name__ == "__main__":
    raise SystemExit(main())
