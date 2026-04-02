import { useState, useRef, useEffect } from "react";

const POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
const POSITION_LABELS = {
  P: "Pitcher", C: "Catcher", "1B": "First Base", "2B": "Second Base",
  "3B": "Third Base", SS: "Shortstop", LF: "Left Field", CF: "Center Field",
  RF: "Right Field", DH: "Designated Hitter"
};
const FIELD_POSITIONS = {
  P:  { top: "54%", left: "50%" }, C:  { top: "80%", left: "50%" },
  "1B": { top: "52%", left: "72%" }, "2B": { top: "38%", left: "62%" },
  "3B": { top: "52%", left: "28%" }, SS: { top: "38%", left: "38%" },
  LF:  { top: "18%", left: "22%" }, CF: { top: "10%", left: "50%" },
  RF:  { top: "18%", left: "78%" }, DH: { top: "88%", left: "78%" },
};

// Auto-fill priority: premium defensive positions first
// SS > 3B > 2B for infield, CF > LF/RF for outfield
const AUTOFILL_ORDER = ["P", "C", "SS", "3B", "2B", "1B", "CF", "LF", "RF", "DH"];
