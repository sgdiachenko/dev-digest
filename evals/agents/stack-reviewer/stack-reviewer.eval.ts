import { describeAgent, runAgentCases } from "../../src/index.js";
import { cases } from "./stack-reviewer.cases.js";

describeAgent("stack-reviewer", () => runAgentCases("stack-reviewer", cases));
