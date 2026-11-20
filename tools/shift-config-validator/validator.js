import Ajv from "ajv";

// The schema remains a separate editable project file. Compile once per runtime.
const validators = new WeakMap();
const requests = new WeakMap();

function fieldPath(pointer) {
  return pointer.split("/").slice(1)
    .map(part => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .join(".");
}

function schemaMessage(error) {
  const path = fieldPath(error.instancePath) || "config";
  switch (error.keyword) {
    case "required":
      return `${path}.${error.params.missingProperty}: отсутствует обязательное поле`;
    case "additionalProperties":
      return `${path}.${error.params.additionalProperty}: неизвестное поле`;
    case "type":
      return `${path}: ожидается тип ${error.params.type}`;
    case "minimum":
      return `${path}: значение должно быть не меньше ${error.params.limit}`;
    case "exclusiveMinimum":
      return `${path}: значение должно быть больше ${error.params.limit}`;
    case "minItems":
      return `${path}: массив должен содержать минимум ${error.params.limit} элемент(а)`;
    case "minLength":
      return `${path}: строка не должна быть пустой`;
    default:
      return `${path}: ${error.message}`;
  }
}

function relationshipErrors(config) {
  const errors = [];
  const { customersTotal, toysBudget, orderSize, durationSeconds,
    warnThresholdSeconds } = config;

  // Technical numeric precision limits, not balance limits or resource budgets.
  for (const [path, value] of [
    ["customersTotal", customersTotal], ["maxActiveOrders", config.maxActiveOrders],
    ["toysBudget", toysBudget], ["orderSize.min", orderSize.min],
    ["orderSize.max", orderSize.max], ["seed", config.seed]
  ]) {
    if (value !== undefined && value !== null && !Number.isSafeInteger(value)) {
      errors.push(`${path}: целое число выходит за диапазон точных целых JavaScript`);
    }
  }

  if (orderSize.min > orderSize.max) {
    errors.push("orderSize.max: должно быть не меньше orderSize.min");
  } else {
    if (orderSize.weights.length !== orderSize.max - orderSize.min + 1) {
      errors.push("orderSize.weights: длина должна равняться max − min + 1");
    }
    const lower = customersTotal * orderSize.min;
    const upper = customersTotal * orderSize.max;
    if (!Number.isSafeInteger(lower) || !Number.isSafeInteger(upper)) {
      errors.push("toysBudget: границы бюджета выходят за диапазон точных целых JavaScript");
    } else if (toysBudget < lower || toysBudget > upper) {
      errors.push(`toysBudget: должно быть от ${lower} до ${upper} для заданных customersTotal и orderSize`);
    }
  }

  const weightSum = orderSize.weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(weightSum) || weightSum <= 0) {
    errors.push("orderSize.weights: сумма весов должна быть конечным числом больше 0");
  }
  if (warnThresholdSeconds >= durationSeconds) {
    errors.push("warnThresholdSeconds: должно быть меньше durationSeconds");
  }
  return errors;
}

export function createValidator(schema) {
  const ajv = new Ajv({
    allErrors: true,
    strict: true,
    strictNumbers: true,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false
  });
  const validate = ajv.compile(schema);
  return config => {
    const valid = validate(config);
    // Only read nested values after their structure and types have been checked.
    const errors = valid ? relationshipErrors(config) : validate.errors.map(schemaMessage);
    return { valid: errors.length === 0, errors };
  };
}

function reportFailure(runtime, messages, logger) {
  runtime.globalVars.LevelConfigLoaded = 0;
  runtime.globalVars.LevelConfigError = messages.join("\n");
  for (const message of messages) logger.error(`[SHIFT CONFIG] ${message}`);
  return { valid: false, errors: messages };
}

export async function loadShiftConfig(runtime, logger = console) {
  const request = (requests.get(runtime) || 0) + 1;
  requests.set(runtime, request);
  runtime.globalVars.LevelConfigLoaded = 0;
  runtime.globalVars.LevelConfigError = "";
  try {
    const instance = runtime.objects.LevelConfig.getFirstInstance();
    if (!instance) throw new Error("Объект LevelConfig отсутствует");
    const config = instance.getJsonDataCopy();
    let pending = validators.get(runtime);
    if (!pending) {
      pending = runtime.assets.fetchJson("level-config.schema.json").then(createValidator);
      validators.set(runtime, pending);
    }
    let validate;
    try {
      validate = await pending;
    } catch (error) {
      // Allow retry after a failed schema load instead of caching a rejected promise.
      if (validators.get(runtime) === pending) validators.delete(runtime);
      throw error;
    }
    if (requests.get(runtime) !== request) return { valid: false, superseded: true, errors: [] };
    const result = validate(config);
    if (!result.valid) return reportFailure(runtime, result.errors, logger);
    runtime.globalVars.LevelConfigError = "";
    runtime.globalVars.LevelConfigLoaded = 1;
    logger.log(`[SHIFT CONFIG] OK; durationSeconds=${config.durationSeconds}; customersTotal=${config.customersTotal}; maxActiveOrders=${config.maxActiveOrders}; toysBudget=${config.toysBudget}`);
    return result;
  } catch (error) {
    if (requests.get(runtime) !== request) return { valid: false, superseded: true, errors: [] };
    return reportFailure(runtime, [`Не удалось проверить конфиг: ${error.message}`], logger);
  }
}
