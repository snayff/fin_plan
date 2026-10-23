// Registers happy-dom's globals (window, document, ...) in its own preload so
// it runs before setup.ts. ES imports are hoisted, so registering inside
// setup.ts let its imports (e.g. @testing-library/dom via jest-dom/jest-axe)
// evaluate first — `screen` then binds to a missing document.body.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

// happy-dom >= 20.9 implements the Web Animations API. framer-motion feature-
// detects it and runs real WAAPI animations, whose cancellation on unmount
// rejects `animation.finished` with an unhandled AbortError. Tests don't
// assert on animation, so keep framer-motion on its non-WAAPI path.
delete (Element.prototype as { animate?: unknown }).animate;
