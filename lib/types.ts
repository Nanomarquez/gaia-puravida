export type Unit = "g" | "kg" | "ml" | "l" | "unit";

export type UnitSystem = "mass" | "volume" | "unit";

export interface RawMaterialRecord {
  id: string;
  name: string;
  description?: string;
  purchasePrice: number;
  purchaseQuantity: number;
  purchaseUnit: Unit;
  salePrice?: number;
  supplier?: string;
  tags?: string[];
  notes?: string;
  currency?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PersistedRawMaterial
  extends Omit<RawMaterialRecord, "createdAt" | "updatedAt" | "id"> {
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProductMaterialInput {
  materialId: string;
  quantity: number;
  unit: Unit;
}

export interface ProductRecord {
  id: string;
  name: string;
  description?: string;
  batchSize: number;
  batchUnit: string;
  materials: ProductMaterialInput[];
  laborCost: number;
  additionalCost: number;
  targetMargin: number;
  overrideSalePrice?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PersistedProduct
  extends Omit<ProductRecord, "createdAt" | "updatedAt" | "id"> {
  createdAt?: unknown;
  updatedAt?: unknown;
}

