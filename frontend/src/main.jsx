import React from "react";
import { createRoot } from "react-dom/client";
import CatalogPage from "./pages/CatalogPage";
import MoodPage from "./pages/MoodPage";
import "./index.css";

const isMoodPage = window.location.pathname.endsWith("/mood.html");
document.body.classList.toggle("mood-page-body", isMoodPage);
createRoot(document.getElementById("root")).render(
  <React.StrictMode>{isMoodPage ? <MoodPage /> : <CatalogPage />}</React.StrictMode>
);
