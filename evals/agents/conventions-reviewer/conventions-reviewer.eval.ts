import { describeAgent, runAgentCases } from "../../src/index.js";
import { cases } from "./conventions-reviewer.cases.js";

describeAgent("conventions-reviewer", () => runAgentCases("conventions-reviewer", cases));
