import { HelmetProvider } from "react-helmet-async";
import { createRoot as createReactRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ViteReactSSG } from "vite-react-ssg";
import { routes } from "./routes";
import "./index.css";

const routerOptions = { routes };
const hasPrerenderedMarkup =
  typeof document === "undefined" ||
  document.querySelector('[data-server-rendered="true"]') !== null;

export const createRoot = hasPrerenderedMarkup
  ? ViteReactSSG(routerOptions, undefined, { rootContainer: "#app" })
  : async () => undefined;

if (!hasPrerenderedMarkup) {
  const container = document.getElementById("app");
  if (!container) {
    throw new Error("Could not find the #app root container");
  }

  createReactRoot(container).render(
    <HelmetProvider>
      <RouterProvider
        router={createBrowserRouter(routerOptions.routes)}
        future={{ v7_startTransition: true }}
      />
    </HelmetProvider>,
  );
}
