import type {
  ProductMaterialInput,
  ProductRecord,
  RawMaterialRecord,
  Unit,
  UnitSystem,
} from "./types";

type ProductCostResult = {
  totalMaterialCost: number;
  totalCost: number;
  unitCost: number;
  recommendedPrice: number;
  breakdown: Array<{
    materialId: string;
    cost: number;
    quantity: number;
    unit: Unit;
    valid: boolean;
    warning?: string;
  }>;
};

export const getUnitSystem = (unit: Unit): UnitSystem => {
  if (unit === "g" || unit === "kg") {
    return "mass";
  }

  if (unit === "ml" || unit === "l") {
    return "volume";
  }

  return "unit";
};

export const convertToBaseUnit = (quantity: number, unit: Unit): number => {
  if (unit === "kg") {
    return quantity * 1000;
  }

  if (unit === "l") {
    return quantity * 1000;
  }

  return quantity;
};

export const convertFromBaseUnit = (
  baseQuantity: number,
  targetUnit: Unit,
): number => {
  if (targetUnit === "kg") {
    return baseQuantity / 1000;
  }

  if (targetUnit === "l") {
    return baseQuantity / 1000;
  }

  return baseQuantity;
};

export const getMaterialDerivedValues = (material: RawMaterialRecord) => {
  const unitSystem = getUnitSystem(material.purchaseUnit);
  const baseQuantity = convertToBaseUnit(
    material.purchaseQuantity,
    material.purchaseUnit,
  );

  const pricePerBaseUnit =
    baseQuantity > 0 ? material.purchasePrice / baseQuantity : 0;

  const pricePerGram =
    unitSystem === "mass" ? pricePerBaseUnit : undefined;
  const pricePerKilogram =
    unitSystem === "mass" ? pricePerBaseUnit * 1000 : undefined;
  const pricePerMilliliter =
    unitSystem === "volume" ? pricePerBaseUnit : undefined;
  const pricePerLiter =
    unitSystem === "volume" ? pricePerBaseUnit * 1000 : undefined;
  const pricePerUnit =
    unitSystem === "unit" && material.purchaseQuantity > 0
      ? material.purchasePrice / material.purchaseQuantity
      : undefined;

  return {
    unitSystem,
    baseQuantity,
    pricePerBaseUnit,
    pricePerGram,
    pricePerKilogram,
    pricePerMilliliter,
    pricePerLiter,
    pricePerUnit,
  };
};

export const getProductMaterialCost = (
  material: RawMaterialRecord | undefined,
  requirement: ProductMaterialInput,
) => {
  if (!material) {
    return {
      cost: 0,
      valid: false,
      warning: "Materia prima no encontrada",
    };
  }

  const derived = getMaterialDerivedValues(material);
  const requirementSystem = getUnitSystem(requirement.unit);

  if (derived.unitSystem !== requirementSystem) {
    return {
      cost: 0,
      valid: false,
      warning:
        "Unidad incompatible. Ajusta la unidad de la materia prima o del producto",
    };
  }

  const requirementBaseQuantity = convertToBaseUnit(
    requirement.quantity,
    requirement.unit,
  );

  const cost = derived.pricePerBaseUnit * requirementBaseQuantity;

  return {
    cost,
    valid: true,
  };
};

export const calculateProductCosts = (
  product: ProductRecord,
  materials: RawMaterialRecord[],
): ProductCostResult => {
  const materialDictionary = new Map(materials.map((item) => [item.id, item]));
  const breakdown = product.materials.map((item) => {
    const material = materialDictionary.get(item.materialId);
    const result = getProductMaterialCost(material, item);

    return {
      materialId: item.materialId,
      cost: result.cost,
      quantity: item.quantity,
      unit: item.unit,
      valid: result.valid,
      warning: result.warning,
    };
  });

  const totalMaterialCost = breakdown.reduce((sum, item) => {
    return sum + item.cost;
  }, 0);

  const totalCost =
    totalMaterialCost + product.laborCost + product.additionalCost;

  const unitCost =
    product.batchSize > 0 ? totalCost / product.batchSize : totalCost;

  const recommendedPrice =
    product.targetMargin > 0 ? unitCost * (1 + product.targetMargin / 100) : unitCost;

  return {
    totalMaterialCost,
    totalCost,
    unitCost,
    recommendedPrice,
    breakdown,
  };
};

