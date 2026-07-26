export interface ScenarioObservation {
  tick: number;
  state: Record<string, unknown>;
  runtimeExceptions: string[];
}

export type ScenarioAssertion =
  | {
      type: "equals";
      label: string;
      path: string;
      expected: unknown;
    }
  | {
      type: "oneOf";
      label: string;
      path: string;
      expected: unknown[];
    }
  | {
      type: "everEquals";
      label: string;
      path: string;
      expected: unknown;
    }
  | {
      type: "everOneOf";
      label: string;
      path: string;
      expected: unknown[];
    }
  | {
      type: "becomesTrueWithin";
      label: string;
      path: string;
      ticks: number;
    }
  | {
      type: "remainsUnchanged";
      label: string;
      path: string;
      ticks: number;
    }
  | {
      type: "exists";
      label: string;
      path: string;
    }
  | {
      type: "notExists";
      label: string;
      path: string;
    }
  | {
      type: "hitPointsDecreased";
      label: string;
      path: string;
    }
  | {
      type: "postureTransition";
      label: string;
      path: string;
      from: string;
      to: string;
      withinTicks: number;
    }
  | {
      type: "noRuntimeException";
      label: string;
    };

export interface AssertionResult {
  status: "pass" | "fail";
  label: string;
  message?: string;
  expected?: unknown;
  actual?: unknown;
  observedTick?: number;
}

export function evaluateAssertions(
  assertions: ScenarioAssertion[],
  observations: ScenarioObservation[]
): AssertionResult[] {
  const ordered = [...observations].sort((left, right) => left.tick - right.tick);
  return assertions.map((assertion) => evaluateAssertion(assertion, ordered));
}

function evaluateAssertion(
  assertion: ScenarioAssertion,
  observations: ScenarioObservation[]
): AssertionResult {
  switch (assertion.type) {
    case "equals":
      return evaluateEquals(assertion, observations);
    case "oneOf":
      return evaluateOneOf(assertion, observations);
    case "everEquals":
      return evaluateEverEquals(assertion, observations);
    case "everOneOf":
      return evaluateEverOneOf(assertion, observations);
    case "becomesTrueWithin":
      return evaluateBecomesTrueWithin(assertion, observations);
    case "remainsUnchanged":
      return evaluateRemainsUnchanged(assertion, observations);
    case "exists":
      return evaluateExists(assertion, observations, true);
    case "notExists":
      return evaluateExists(assertion, observations, false);
    case "hitPointsDecreased":
      return evaluateHitPointsDecreased(assertion, observations);
    case "postureTransition":
      return evaluatePostureTransition(assertion, observations);
    case "noRuntimeException":
      return evaluateNoRuntimeException(assertion, observations);
  }
}

function evaluateEverEquals(
  assertion: Extract<ScenarioAssertion, { type: "everEquals" }>,
  observations: ScenarioObservation[]
): AssertionResult {
  const observed = observations
    .map((observation) => ({ tick: observation.tick, value: getPath(observation.state, assertion.path) }))
    .find((item) => Object.is(item.value, assertion.expected));
  if (observed) return pass(assertion.label, observed.tick);
  const latest = lastDefined(assertion.path, observations);
  return fail(assertion.label, `expected ${String(assertion.expected)}, actual ${String(latest?.value)}`, {
    expected: assertion.expected,
    actual: latest?.value,
    ...observedTick(latest?.tick)
  });
}

function evaluateEverOneOf(
  assertion: Extract<ScenarioAssertion, { type: "everOneOf" }>,
  observations: ScenarioObservation[]
): AssertionResult {
  const observed = observations
    .map((observation) => ({ tick: observation.tick, value: getPath(observation.state, assertion.path) }))
    .find((item) => assertion.expected.some((expected) => Object.is(expected, item.value)));
  if (observed) return pass(assertion.label, observed.tick);
  const latest = lastDefined(assertion.path, observations);
  return fail(assertion.label, `expected one of ${assertion.expected.join(", ")}, actual ${String(latest?.value)}`, {
    expected: assertion.expected,
    actual: latest?.value,
    ...observedTick(latest?.tick)
  });
}

function evaluateEquals(
  assertion: Extract<ScenarioAssertion, { type: "equals" }>,
  observations: ScenarioObservation[]
): AssertionResult {
  const observed = lastDefined(assertion.path, observations);
  if (Object.is(observed?.value, assertion.expected)) return pass(assertion.label, observed?.tick);
  return fail(assertion.label, `expected ${String(assertion.expected)}, actual ${String(observed?.value)}`, {
    expected: assertion.expected,
    actual: observed?.value,
    ...observedTick(observed?.tick)
  });
}

function evaluateOneOf(
  assertion: Extract<ScenarioAssertion, { type: "oneOf" }>,
  observations: ScenarioObservation[]
): AssertionResult {
  const observed = lastDefined(assertion.path, observations);
  if (assertion.expected.some((expected) => Object.is(expected, observed?.value))) {
    return pass(assertion.label, observed?.tick);
  }
  return fail(assertion.label, `expected one of ${assertion.expected.join(", ")}, actual ${String(observed?.value)}`, {
    expected: assertion.expected,
    actual: observed?.value,
    ...observedTick(observed?.tick)
  });
}

function evaluateBecomesTrueWithin(
  assertion: Extract<ScenarioAssertion, { type: "becomesTrueWithin" }>,
  observations: ScenarioObservation[]
): AssertionResult {
  const window = observationsWithin(assertion.ticks, observations);
  const observed = window.find((observation) => getPath(observation.state, assertion.path) === true);
  if (observed) return pass(assertion.label, observed.tick);
  return fail(assertion.label, `expected ${assertion.path} to become true within ${assertion.ticks} ticks`);
}

function evaluateRemainsUnchanged(
  assertion: Extract<ScenarioAssertion, { type: "remainsUnchanged" }>,
  observations: ScenarioObservation[]
): AssertionResult {
  const window = latestObservationsWithin(assertion.ticks, observations).filter(
    (observation) => getPath(observation.state, assertion.path) !== undefined
  );
  const baseline = window[0];
  if (!baseline) return fail(assertion.label, `expected ${assertion.path} to be observed`);

  const expected = getPath(baseline.state, assertion.path);
  const changed = window.find((observation) => !Object.is(getPath(observation.state, assertion.path), expected));
  if (!changed) return pass(assertion.label, baseline.tick);
  return fail(assertion.label, `expected ${String(expected)}, actual ${String(getPath(changed.state, assertion.path))}`, {
    expected,
    actual: getPath(changed.state, assertion.path),
    observedTick: changed.tick
  });
}

function evaluateExists(
  assertion: Extract<ScenarioAssertion, { type: "exists" | "notExists" }>,
  observations: ScenarioObservation[],
  shouldExist: boolean
): AssertionResult {
  const observed = firstDefined(assertion.path, observations);
  const exists = observed?.value !== undefined && observed.value !== null;
  if (exists === shouldExist) return pass(assertion.label, observed?.tick);
  return fail(assertion.label, shouldExist ? `expected ${assertion.path} to exist` : `expected ${assertion.path} not to exist`, {
    actual: observed?.value,
    ...observedTick(observed?.tick)
  });
}

function evaluateHitPointsDecreased(
  assertion: Extract<ScenarioAssertion, { type: "hitPointsDecreased" }>,
  observations: ScenarioObservation[]
): AssertionResult {
  const values = observations
    .map((observation) => ({ tick: observation.tick, value: getPath(observation.state, assertion.path) }))
    .filter((item): item is { tick: number; value: number } => typeof item.value === "number");
  const first = values[0];
  const decreased = first
    ? values.find((item) => item.tick > first.tick && item.value < first.value)
    : undefined;
  if (decreased) return pass(assertion.label, decreased.tick);
  const defeated = first
    ? observations.find((observation) => observation.tick > first.tick && getPath(observation.state, assertion.path) === undefined)
    : undefined;
  if (defeated) return pass(assertion.label, defeated.tick);
  return fail(assertion.label, `expected ${assertion.path} to decrease`);
}

function evaluatePostureTransition(
  assertion: Extract<ScenarioAssertion, { type: "postureTransition" }>,
  observations: ScenarioObservation[]
): AssertionResult {
  const fromObservation = observations.find(
    (observation) => getPath(observation.state, assertion.path) === assertion.from
  );
  const toObservation = fromObservation
    ? observations.find(
        (observation) =>
          observation.tick >= fromObservation.tick &&
          observation.tick - fromObservation.tick <= assertion.withinTicks &&
          getPath(observation.state, assertion.path) === assertion.to
      )
    : undefined;
  if (toObservation) return pass(assertion.label, toObservation.tick);
  return fail(assertion.label, `expected ${assertion.from} to transition to ${assertion.to} within ${assertion.withinTicks} ticks`, {
    expected: assertion.to,
    actual: fromObservation ? getPath(fromObservation.state, assertion.path) : undefined,
    ...observedTick(fromObservation?.tick)
  });
}

function evaluateNoRuntimeException(
  assertion: Extract<ScenarioAssertion, { type: "noRuntimeException" }>,
  observations: ScenarioObservation[]
): AssertionResult {
  const failed = observations.find((observation) => observation.runtimeExceptions.length > 0);
  if (!failed) return pass(assertion.label);
  return fail(assertion.label, `runtime exception: ${failed.runtimeExceptions[0]}`, {
    actual: failed.runtimeExceptions,
    observedTick: failed.tick
  });
}

function pass(label: string, observedTick?: number): AssertionResult {
  return observedTick === undefined ? { status: "pass", label } : { status: "pass", label, observedTick };
}

function fail(
  label: string,
  message: string,
  details: Omit<AssertionResult, "status" | "label" | "message"> = {}
): AssertionResult {
  return { status: "fail", label, message, ...details };
}

function firstDefined(
  path: string,
  observations: ScenarioObservation[]
): { tick: number; value: unknown } | undefined {
  for (const observation of observations) {
    const value = getPath(observation.state, path);
    if (value !== undefined) return { tick: observation.tick, value };
  }
  return undefined;
}

function lastDefined(
  path: string,
  observations: ScenarioObservation[]
): { tick: number; value: unknown } | undefined {
  return firstDefined(path, [...observations].reverse());
}

function observationsWithin(ticks: number, observations: ScenarioObservation[]): ScenarioObservation[] {
  const start = observations[0]?.tick;
  if (start === undefined) return [];
  return observations.filter((observation) => observation.tick - start <= ticks);
}

function latestObservationsWithin(ticks: number, observations: ScenarioObservation[]): ScenarioObservation[] {
  const end = observations.at(-1)?.tick;
  if (end === undefined) return [];
  return observations.filter((observation) => end - observation.tick < ticks);
}

function observedTick(tick: number | undefined): { observedTick: number } | Record<string, never> {
  return tick === undefined ? {} : { observedTick: tick };
}

function getPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (typeof current !== "object" || current === null) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}
