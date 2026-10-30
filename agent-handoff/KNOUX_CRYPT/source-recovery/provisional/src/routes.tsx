import type { RouteRecord } from "vite-react-ssg";
import App from "./App";

export const routes: RouteRecord[] = [
  { path: "/", element: <App />, entry: "src/App.tsx" },
];
