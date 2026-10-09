// Shared by the converter and the catalog download.

/** The element with this id. The page is server-rendered, so it is there. */
export const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
