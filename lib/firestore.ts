import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/firebase";
import type {
  PersistedProduct,
  PersistedRawMaterial,
  ProductMaterialInput,
  ProductRecord,
  RawMaterialRecord,
} from "./types";

const rawMaterialsCollection = collection(db, "rawMaterials");
const productsCollection = collection(db, "products");

type SnapshotCallback<T> = (items: T[]) => void;
type ErrorCallback = (error: FirestoreError) => void;

const toDate = (value: unknown) => {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate();
  }

  return undefined;
};

const removeUndefined = <T extends object>(object: T) => {
  return Object.fromEntries(
    Object.entries(object as Record<string, unknown>).filter(
      ([, value]) => value !== undefined,
    ),
  ) as T;
};

const normalizeRawMaterial = (id: string, data: PersistedRawMaterial) => {
  const tags =
    Array.isArray(data.tags) && data.tags.every((tag) => typeof tag === "string")
      ? data.tags
      : [];

  return {
    id,
    name: data.name,
    description: data.description ?? "",
    purchasePrice: data.purchasePrice,
    purchaseQuantity: data.purchaseQuantity,
    purchaseUnit: data.purchaseUnit,
    salePrice: typeof data.salePrice === "number" ? data.salePrice : undefined,
    supplier: data.supplier ?? "",
    tags,
    notes: data.notes ?? "",
    currency: data.currency ?? "ARS",
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } satisfies RawMaterialRecord;
};

const normalizeProduct = (id: string, data: PersistedProduct) => {
  const materials =
    Array.isArray(data.materials) && data.materials.length
      ? data.materials.filter(
          (item): item is ProductMaterialInput =>
            item !== undefined &&
            typeof item === "object" &&
            typeof item.materialId === "string" &&
            typeof item.quantity === "number" &&
            typeof item.unit === "string",
        )
      : [];

  return {
    id,
    name: data.name,
    description: data.description ?? "",
    batchSize: data.batchSize,
    batchUnit: data.batchUnit,
    materials,
    laborCost: data.laborCost,
    additionalCost: data.additionalCost,
    targetMargin: data.targetMargin,
    overrideSalePrice:
      typeof data.overrideSalePrice === "number"
        ? data.overrideSalePrice
        : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } satisfies ProductRecord;
};

export const subscribeToRawMaterials = (
  onNext: SnapshotCallback<RawMaterialRecord>,
  onError?: ErrorCallback,
): Unsubscribe => {
  const q = query(rawMaterialsCollection, orderBy("name", "asc"));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((document) =>
        normalizeRawMaterial(document.id, document.data() as PersistedRawMaterial),
      );

      onNext(items);
    },
    onError,
  );
};

export const subscribeToProducts = (
  onNext: SnapshotCallback<ProductRecord>,
  onError?: ErrorCallback,
): Unsubscribe => {
  const q = query(productsCollection, orderBy("name", "asc"));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((document) =>
        normalizeProduct(document.id, document.data() as PersistedProduct),
      );

      onNext(items);
    },
    onError,
  );
};

type RawMaterialPayload = Omit<
  RawMaterialRecord,
  "id" | "createdAt" | "updatedAt"
>;

export const createRawMaterial = async (payload: RawMaterialPayload) => {
  const { tags, salePrice, ...rest } = payload;

  const data = removeUndefined<PersistedRawMaterial>({
    ...rest,
    salePrice,
    tags: tags ?? [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addDoc(rawMaterialsCollection, data);
};

export const updateRawMaterial = async (
  id: string,
  payload: Partial<RawMaterialPayload>,
) => {
  const reference = doc(rawMaterialsCollection, id);
  const { salePrice, tags, ...rest } = payload;

  const data = removeUndefined({
    ...rest,
    ...(tags ? { tags } : {}),
    salePrice,
    updatedAt: serverTimestamp(),
  });

  await updateDoc(reference, data);
};

export const deleteRawMaterial = async (id: string) => {
  const reference = doc(rawMaterialsCollection, id);

  await deleteDoc(reference);
};

type ProductPayload = Omit<ProductRecord, "id" | "createdAt" | "updatedAt">;

export const createProduct = async (payload: ProductPayload) => {
  const { overrideSalePrice, ...rest } = payload;

  const data = removeUndefined<PersistedProduct>({
    ...rest,
    overrideSalePrice,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addDoc(productsCollection, data);
};

export const updateProduct = async (
  id: string,
  payload: Partial<ProductPayload>,
) => {
  const reference = doc(productsCollection, id);
  const { overrideSalePrice, ...rest } = payload;

  const data = removeUndefined({
    ...rest,
    overrideSalePrice,
    updatedAt: serverTimestamp(),
  });

  await updateDoc(reference, data);
};

export const deleteProduct = async (id: string) => {
  const reference = doc(productsCollection, id);

  await deleteDoc(reference);
};

