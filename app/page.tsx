/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { ModeToggle } from "@/components/ModeToggle";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  createProduct,
  createRawMaterial,
  deleteProduct,
  deleteRawMaterial,
  subscribeToProducts,
  subscribeToRawMaterials,
  updateProduct,
  updateRawMaterial,
} from "@/lib/firestore";
import {
  calculateProductCosts,
  getMaterialDerivedValues,
  getUnitSystem,
} from "@/lib/pricing";
import type {
  ProductMaterialInput,
  ProductRecord,
  RawMaterialRecord,
  Unit,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type MaterialSortKey = "name" | "purchasePrice" | "pricePerUnit";
type ProductSortKey = "name" | "unitCost" | "recommendedPrice";
type DashboardView = "materials" | "products";

type MaterialFormState = {
  id?: string;
  name: string;
  description: string;
  purchasePrice: string;
  purchaseQuantity: string;
  purchaseUnit: Unit;
  salePrice: string;
  supplier: string;
  tags: string;
  notes: string;
  currency: string;
};

type ProductMaterialForm = {
  id: string;
  materialId: string;
  quantity: string;
  unit: Unit;
};

type ProductFormState = {
  id?: string;
  name: string;
  description: string;
  batchSize: string;
  batchUnit: string;
  laborCost: string;
  additionalCost: string;
  targetMargin: string;
  overrideSalePrice: string;
  materials: ProductMaterialForm[];
};

const MASS_UNITS: Unit[] = ["g", "kg"];
const VOLUME_UNITS: Unit[] = ["ml", "l"];
const PIECE_UNITS: Unit[] = ["unit"];

const MATERIAL_UNITS: Array<{ value: Unit; label: string }> = [
  { value: "g", label: "Gramos (g)" },
  { value: "kg", label: "Kilogramos (kg)" },
  { value: "ml", label: "Mililitros (ml)" },
  { value: "l", label: "Litros (l)" },
  { value: "unit", label: "Unidades" },
];

const BATCH_UNIT_OPTIONS = [
  "unidades",
  "kg",
  "g",
  "l",
  "ml",
  "lotes",
  "barra",
];

const VIEW_TABS: Array<{
  id: DashboardView;
  label: string;
  helper: string;
  icon: React.ReactNode;
}> = [
    {
      id: "materials",
      label: "Materias primas",
      helper: "Inventario y costos base",
      icon: <Package className="size-4" />,
    },
    {
      id: "products",
      label: "Productos",
      helper: "Fórmulas y precios finales",
      icon: <Calculator className="size-4" />,
    },
  ];

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
};

const Modal = ({ open, onClose, title, description, children }: ModalProps) => {
  useEffect(() => {
    if (!open) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-3xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="shrink-0"
            aria-label="Cerrar modal"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
};

const inputStyles =
  "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const textareaStyles =
  "flex min-h-[90px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const selectStyles =
  "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const defaultMaterialForm = (): MaterialFormState => ({
  name: "",
  description: "",
  purchasePrice: "",
  purchaseQuantity: "",
  purchaseUnit: "kg",
  salePrice: "",
  supplier: "",
  tags: "",
  notes: "",
  currency: "ARS",
});

const createMaterialRow = (): ProductMaterialForm => ({
  id:
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  materialId: "",
  quantity: "",
  unit: "g",
});

const defaultProductForm = (): ProductFormState => ({
  name: "",
  description: "",
  batchSize: "",
  batchUnit: "unidades",
  laborCost: "",
  additionalCost: "",
  targetMargin: "40",
  overrideSalePrice: "",
  materials: [createMaterialRow()],
});

const formatCurrency = (value: number, currency = "ARS") => {
  if (!Number.isFinite(value)) {
    return "-";
  }

  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
};

const formatCompactNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 2,
  }).format(value);
};

const formatDate = (date?: Date) => {
  if (!date) return "-";

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

const getUnitOptionsForSystem = (unit: Unit) => {
  const system = getUnitSystem(unit);

  if (system === "mass") return MASS_UNITS;
  if (system === "volume") return VOLUME_UNITS;

  return PIECE_UNITS;
};

export default function Home() {
  const { toast } = useToast();

  const [activeView, setActiveView] = useState<DashboardView>("materials");
  const [rawMaterials, setRawMaterials] = useState<RawMaterialRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);

  const [materialForm, setMaterialForm] = useState<MaterialFormState>(
    defaultMaterialForm,
  );
  const [productForm, setProductForm] =
    useState<ProductFormState>(defaultProductForm);

  const [materialSearch, setMaterialSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const [materialSort, setMaterialSort] =
    useState<MaterialSortKey>("name");
  const [materialSortDirection, setMaterialSortDirection] =
    useState<"asc" | "desc">("asc");

  const [productSort, setProductSort] = useState<ProductSortKey>("name");
  const [productSortDirection, setProductSortDirection] =
    useState<"asc" | "desc">("asc");

  const [isSavingMaterial, setIsSavingMaterial] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  const [materialError, setMaterialError] = useState<string | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  const [expandedProductRows, setExpandedProductRows] = useState<
    Record<string, boolean>
  >({});
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToRawMaterials(
      (items) => {
        setRawMaterials(items);
        setMaterialError(null);
      },
      (error) => {
        console.error(error);
        setMaterialError(
          "No pudimos cargar las materias primas. Intenta nuevamente.",
        );
        toast({
          title: "Error al sincronizar materias primas",
          description: "Revisa tu conexión o la configuración de Firebase.",
          variant: "destructive",
        });
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToProducts(
      (items) => {
        setProducts(items);
        setProductError(null);
      },
      (error) => {
        console.error(error);
        setProductError(
          "No pudimos cargar los productos. Intenta nuevamente.",
        );
        toast({
          title: "Error al sincronizar productos",
          description: "Revisa tu conexión o la configuración de Firebase.",
          variant: "destructive",
        });
      },
    );

    return () => unsubscribe();
  }, []);

  const enrichedMaterials = useMemo(() => {
    return rawMaterials.map((material) => {
      const derived = getMaterialDerivedValues(material);

      return {
        ...material,
        derived,
      };
    });
  }, [rawMaterials]);

  const filteredMaterials = useMemo(() => {
    const keyword = materialSearch.trim().toLowerCase();

    const sorted = [...enrichedMaterials].sort((a, b) => {
      let comparator = 0;

      if (materialSort === "name") {
        comparator = a.name.localeCompare(b.name);
      } else if (materialSort === "purchasePrice") {
        comparator = a.purchasePrice - b.purchasePrice;
      } else if (materialSort === "pricePerUnit") {
        comparator =
          (a.derived.pricePerBaseUnit ?? 0) - (b.derived.pricePerBaseUnit ?? 0);
      }

      return materialSortDirection === "asc" ? comparator : -comparator;
    });

    if (!keyword) {
      return sorted;
    }

    return sorted.filter((material) => {
      const haystack = [
        material.name,
        material.description,
        material.supplier,
        ...(material.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [enrichedMaterials, materialSearch, materialSort, materialSortDirection]);

  const materialStats = useMemo(() => {
    const count = enrichedMaterials.length;
    const totalInventoryCost = enrichedMaterials.reduce((sum, item) => {
      return sum + item.purchasePrice;
    }, 0);
    const averagePricePerKg = (() => {
      const prices = enrichedMaterials
        .filter((item) => item.derived.pricePerKilogram)
        .map((item) => item.derived.pricePerKilogram ?? 0);

      if (!prices.length) return 0;

      return prices.reduce((sum, value) => sum + value, 0) / prices.length;
    })();

    const averagePricePerLiter = (() => {
      const prices = enrichedMaterials
        .filter((item) => item.derived.pricePerLiter)
        .map((item) => item.derived.pricePerLiter ?? 0);

      if (!prices.length) return 0;

      return prices.reduce((sum, value) => sum + value, 0) / prices.length;
    })();

    return {
      count,
      totalInventoryCost,
      averagePricePerKg,
      averagePricePerLiter,
    };
  }, [enrichedMaterials]);

  const productsWithDerived = useMemo(() => {
    return products.map((product) => {
      const costs = calculateProductCosts(product, rawMaterials);
      const salePrice = product.overrideSalePrice ?? costs.recommendedPrice;
      const margin =
        salePrice > 0 ? ((salePrice - costs.unitCost) / salePrice) * 100 : 0;
      const hasWarnings = costs.breakdown.some((item) => !item.valid);

      return {
        ...product,
        costs,
        salePrice,
        margin,
        hasWarnings,
      };
    });
  }, [products, rawMaterials]);

  const filteredProducts = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();

    const sorted = [...productsWithDerived].sort((a, b) => {
      let comparator = 0;

      if (productSort === "name") {
        comparator = a.name.localeCompare(b.name);
      } else if (productSort === "unitCost") {
        comparator = a.costs.unitCost - b.costs.unitCost;
      } else if (productSort === "recommendedPrice") {
        comparator = a.salePrice - b.salePrice;
      }

      return productSortDirection === "asc" ? comparator : -comparator;
    });

    if (!keyword) {
      return sorted;
    }

    return sorted.filter((product) => {
      const haystack = [product.name, product.description].join(" ").toLowerCase();

      return haystack.includes(keyword);
    });
  }, [
    productsWithDerived,
    productSearch,
    productSort,
    productSortDirection,
  ]);

  const productStats = useMemo(() => {
    const count = productsWithDerived.length;
    const catalogValue = productsWithDerived.reduce((sum, product) => {
      return sum + product.salePrice * product.batchSize;
    }, 0);
    const averageMargin = (() => {
      if (!productsWithDerived.length) return 0;
      const totalMargin = productsWithDerived.reduce(
        (sum, product) => sum + product.margin,
        0,
      );
      return totalMargin / productsWithDerived.length;
    })();

    return {
      count,
      catalogValue,
      averageMargin,
    };
  }, [productsWithDerived]);

  const resetMaterialForm = useCallback(() => {
    setMaterialForm(defaultMaterialForm);
  }, []);

  const resetProductForm = useCallback(() => {
    setProductForm(defaultProductForm);
  }, []);

  const handleMaterialModalClose = useCallback(() => {
    setIsMaterialModalOpen(false);
    resetMaterialForm();
  }, [resetMaterialForm]);

  const handleProductModalClose = useCallback(() => {
    setIsProductModalOpen(false);
    resetProductForm();
  }, [resetProductForm]);

  const handleCreateMaterialClick = useCallback(() => {
    resetMaterialForm();
    setIsMaterialModalOpen(true);
  }, [resetMaterialForm]);

  const handleCreateProductClick = useCallback(() => {
    resetProductForm();
    setIsProductModalOpen(true);
  }, [resetProductForm]);

  const handleMaterialSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const name = materialForm.name.trim();
    if (!name) {
      toast({
        title: "Falta el nombre",
        description: "Añadí un nombre para la materia prima.",
        variant: "destructive",
      });
      return;
    }

    const purchasePrice = Number(materialForm.purchasePrice);
    const purchaseQuantity = Number(materialForm.purchaseQuantity);

    if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
      toast({
        title: "Precio inválido",
        description: "El precio de compra debe ser un número mayor a cero.",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isFinite(purchaseQuantity) || purchaseQuantity <= 0) {
      toast({
        title: "Cantidad inválida",
        description: "La cantidad de compra debe ser mayor a cero.",
        variant: "destructive",
      });
      return;
    }

    if (
      materialForm.salePrice &&
      (!Number.isFinite(Number(materialForm.salePrice)) ||
        Number(materialForm.salePrice) <= 0)
    ) {
      toast({
        title: "Precio de venta inválido",
        description: "Usa un número mayor a cero para el precio de venta.",
        variant: "destructive",
      });
      return;
    }

    const salePrice = materialForm.salePrice
      ? Number(materialForm.salePrice)
      : undefined;

    const tags = materialForm.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const payload = {
      name,
      description: materialForm.description.trim(),
      purchasePrice,
      purchaseQuantity,
      purchaseUnit: materialForm.purchaseUnit,
      salePrice,
      supplier: materialForm.supplier.trim(),
      tags,
      notes: materialForm.notes.trim(),
      currency: materialForm.currency.trim().toUpperCase() || "ARS",
    };

    setIsSavingMaterial(true);

    try {
      if (materialForm.id) {
        await updateRawMaterial(materialForm.id, payload);
        toast({
          title: "Materia prima actualizada",
          description: `Actualizaste ${name} correctamente.`,
        });
      } else {
        await createRawMaterial(payload);
        toast({
          title: "Materia prima creada",
          description: `Guardamos ${name} en tu inventario.`,
        });
      }

      handleMaterialModalClose();
    } catch (error) {
      console.error(error);
      toast({
        title: "No se pudo guardar la materia prima",
        description: "Revisa la consola o tu configuración de Firebase.",
        variant: "destructive",
      });
    } finally {
      setIsSavingMaterial(false);
    }
  };

  const handleProductSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const name = productForm.name.trim();
    if (!name) {
      toast({
        title: "Falta el nombre del producto",
        description: "Añadí un nombre para poder guardarlo.",
        variant: "destructive",
      });
      return;
    }

    const batchSize = Number(productForm.batchSize);
    const laborCost = Number(productForm.laborCost || 0);
    const additionalCost = Number(productForm.additionalCost || 0);
    const targetMargin = Number(productForm.targetMargin || 0);
    const overrideSalePrice = productForm.overrideSalePrice
      ? Number(productForm.overrideSalePrice)
      : undefined;

    if (!Number.isFinite(batchSize) || batchSize <= 0) {
      toast({
        title: "Lote inválido",
        description: "Define cuántas unidades produce este lote.",
        variant: "destructive",
      });
      return;
    }

    const materialsLines = productForm.materials
      .map((line) => {
        const quantity = Number(line.quantity);

        if (!line.materialId || !Number.isFinite(quantity) || quantity <= 0) {
          return null;
        }

        return {
          materialId: line.materialId,
          quantity,
          unit: line.unit,
        } satisfies ProductMaterialInput;
      })
      .filter((line): line is ProductMaterialInput => line !== null);

    if (!materialsLines.length) {
      toast({
        title: "Faltan materias primas",
        description: "Añadí al menos una materia prima al producto.",
        variant: "destructive",
      });
      return;
    }

    const payload: Omit<ProductRecord, "id" | "createdAt" | "updatedAt"> = {
      name,
      description: productForm.description.trim(),
      batchSize,
      batchUnit: productForm.batchUnit,
      materials: materialsLines,
      laborCost: Number.isFinite(laborCost) ? laborCost : 0,
      additionalCost: Number.isFinite(additionalCost) ? additionalCost : 0,
      targetMargin: Number.isFinite(targetMargin) ? targetMargin : 0,
      overrideSalePrice:
        overrideSalePrice && Number.isFinite(overrideSalePrice)
          ? overrideSalePrice
          : undefined,
    };

    setIsSavingProduct(true);

    try {
      if (productForm.id) {
        await updateProduct(productForm.id, payload);
        toast({
          title: "Producto actualizado",
          description: `Guardamos los cambios de ${name}.`,
        });
      } else {
        await createProduct(payload);
        toast({
          title: "Producto creado",
          description: `Sumamos ${name} al catálogo.`,
        });
      }

      handleProductModalClose();
    } catch (error) {
      console.error(error);
      toast({
        title: "No se pudo guardar el producto",
        description: "Revisa la consola o tu configuración de Firebase.",
        variant: "destructive",
      });
    } finally {
      setIsSavingProduct(false);
    }
  };

  const startMaterialEdition = (material: RawMaterialRecord) => {
    setMaterialForm({
      id: material.id,
      name: material.name,
      description: material.description ?? "",
      purchasePrice: material.purchasePrice.toString(),
      purchaseQuantity: material.purchaseQuantity.toString(),
      purchaseUnit: material.purchaseUnit,
      salePrice: material.salePrice ? material.salePrice.toString() : "",
      supplier: material.supplier ?? "",
      tags: (material.tags ?? []).join(", "),
      notes: material.notes ?? "",
      currency: material.currency ?? "ARS",
    });
    setIsMaterialModalOpen(true);
  };

  const startProductEdition = (product: ProductRecord) => {
    setProductForm({
      id: product.id,
      name: product.name,
      description: product.description ?? "",
      batchSize: product.batchSize.toString(),
      batchUnit: product.batchUnit,
      laborCost: product.laborCost.toString(),
      additionalCost: product.additionalCost.toString(),
      targetMargin: product.targetMargin.toString(),
      overrideSalePrice: product.overrideSalePrice
        ? product.overrideSalePrice.toString()
        : "",
      materials:
        product.materials.length > 0
          ? product.materials.map((item) => ({
            id:
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : Math.random().toString(36).slice(2),
            materialId: item.materialId,
            quantity: item.quantity.toString(),
            unit: item.unit,
          }))
          : [createMaterialRow()],
    });
    setIsProductModalOpen(true);
  };

  const handleDeleteMaterial = async (material: RawMaterialRecord) => {
    const confirmation = window.confirm(
      `¿Eliminar ${material.name}? Esta acción no se puede deshacer.`,
    );

    if (!confirmation) return;

    try {
      await deleteRawMaterial(material.id);
      toast({
        title: "Materia prima eliminada",
        description: `${material.name} salió del inventario.`,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "No se pudo eliminar",
        description: "Revisa la consola o tu configuración de Firebase.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteProduct = async (product: ProductRecord) => {
    const confirmation = window.confirm(
      `¿Eliminar ${product.name}? Esta acción no se puede deshacer.`,
    );

    if (!confirmation) return;

    try {
      await deleteProduct(product.id);
      toast({
        title: "Producto eliminado",
        description: `${product.name} salió del catálogo.`,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "No se pudo eliminar el producto",
        description: "Revisa la consola o tu configuración de Firebase.",
        variant: "destructive",
      });
    }
  };

  const getMaterialById = useCallback(
    (id: string) => rawMaterials.find((material) => material.id === id),
    [rawMaterials],
  );

  const getSuggestedUnit = useCallback((purchaseUnit: Unit) => {
    if (purchaseUnit === "kg") {
      return "g";
    }

    if (purchaseUnit === "l") {
      return "ml";
    }

    return purchaseUnit;
  }, []);

  const updateProductMaterialField = useCallback(
    (id: string, field: keyof ProductMaterialForm, value: string) => {
      setProductForm((prev) => ({
        ...prev,
        materials: prev.materials.map((item) => {
          if (item.id !== id) {
            return item;
          }

          if (field === "materialId") {
            const selectedMaterial = getMaterialById(value);
            const allowedUnits = selectedMaterial
              ? getUnitOptionsForSystem(selectedMaterial.purchaseUnit)
              : MASS_UNITS;

            const nextUnit =
              selectedMaterial && !allowedUnits.includes(item.unit)
                ? getSuggestedUnit(selectedMaterial.purchaseUnit)
                : item.unit;

            return {
              ...item,
              materialId: value,
              unit: nextUnit,
            };
          }

          if (field === "unit") {
            return {
              ...item,
              unit: value as Unit,
            };
          }

          return {
            ...item,
            [field]: value,
          };
        }),
      }));
    },
    [getMaterialById, getSuggestedUnit],
  );

  const addMaterialLine = () => {
    setProductForm((prev) => ({
      ...prev,
      materials: [...prev.materials, createMaterialRow()],
    }));
  };

  const removeMaterialLine = (id: string) => {
    setProductForm((prev) => ({
      ...prev,
      materials:
        prev.materials.length > 1
          ? prev.materials.filter((item) => item.id !== id)
          : prev.materials,
    }));
  };

  const toggleProductDetails = (id: string) => {
    setExpandedProductRows((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const renderMaterialStats = () => (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-border bg-card/70 p-5 shadow-sm">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Materias primas
        </p>
        <p className="mt-2 text-3xl font-semibold">{materialStats.count}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Referencias activas
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card/70 p-5 shadow-sm">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Inversión total
        </p>
        <p className="mt-2 text-3xl font-semibold">
          {formatCurrency(materialStats.totalInventoryCost)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Suma de compras registradas
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card/70 p-5 shadow-sm">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Productos
        </p>
        <p className="mt-2 text-3xl font-semibold">{productStats.count}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Fórmulas registradas
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card/70 p-5 shadow-sm">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Valor estimado del catálogo
        </p>
        <p className="mt-2 text-3xl font-semibold">
          {formatCurrency(productStats.catalogValue)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Según precio recomendado actual
        </p>
      </div>
    </div>
  );

  const renderMaterialsSection = () => (
    <div className="space-y-8">

      <section className="rounded-3xl border border-border bg-card/40 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-base font-semibold">Inventario de materias primas</h3>
            <p className="text-sm text-muted-foreground">
              Ordena, busca y actualiza la lista de insumos disponibles.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <Button
              type="button"
              onClick={handleCreateMaterialClick}
              className="w-full sm:w-auto"
            >
              <Plus className="size-4" />
              Nueva materia prima
            </Button>
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className={cn(
                  inputStyles,
                  "w-full pl-10 bg-background/60 backdrop-blur",
                )}
                placeholder="Buscar materia..."
                value={materialSearch}
                onChange={(event) => setMaterialSearch(event.target.value)}
              />
            </div>
            <select
              className={cn(selectStyles, "w-full sm:w-44")}
              value={materialSort}
              onChange={(event) =>
                setMaterialSort(event.target.value as MaterialSortKey)
              }
            >
              <option value="name">Ordenar por nombre</option>
              <option value="purchasePrice">Ordenar por costo de compra</option>
              <option value="pricePerUnit">Ordenar por costo unitario</option>
            </select>
            <select
              className={cn(selectStyles, "w-full sm:w-40")}
              value={materialSortDirection}
              onChange={(event) =>
                setMaterialSortDirection(event.target.value as "asc" | "desc")
              }
            >
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </select>
          </div>
        </div>

        {materialError && (
          <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {materialError}
          </p>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-[760px] divide-y divide-border/70 text-sm w-full">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Materia prima</th>
                <th className="px-4 py-3 text-left font-medium">Compra</th>
                <th className="px-4 py-3 text-left font-medium">Costo base</th>
                <th className="px-4 py-3 text-left font-medium">Actualizado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {filteredMaterials.map((material) => (
                <tr
                  key={material.id}
                  className="hover:bg-muted/20 transition-colors"
                >
                  <td className="w-[220px] px-4 py-4 align-top">
                    <p className="font-medium text-foreground">{material.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {material.supplier ? `Proveedor: ${material.supplier}` : "Sin proveedor"}
                    </p>
                    {material.tags?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {material.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <p>{formatCurrency(material.purchasePrice, material.currency)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatCompactNumber(material.purchaseQuantity)}{" "}
                      {material.purchaseUnit}
                    </p>
                  </td>
                  <td className="px-4 py-4 align-top">
                    {material.derived.unitSystem === "mass" ? (
                      <div>
                        <p>
                          {formatCurrency(material.derived.pricePerKilogram ?? 0, material.currency)}{" "}
                          / kg
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(material.derived.pricePerGram ?? 0, material.currency)}{" "}
                          / g
                        </p>
                      </div>
                    ) : material.derived.unitSystem === "volume" ? (
                      <div>
                        <p>
                          {formatCurrency(material.derived.pricePerLiter ?? 0, material.currency)}{" "}
                          / l
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(
                            material.derived.pricePerMilliliter ?? 0,
                            material.currency,
                          )}{" "}
                          / ml
                        </p>
                      </div>
                    ) : (
                      <p>
                        {formatCurrency(material.derived.pricePerUnit ?? 0, material.currency)} c/u
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <p className="text-xs text-muted-foreground">
                      {formatDate(material.updatedAt)}
                    </p>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => startMaterialEdition(material)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        onClick={() => handleDeleteMaterial(material)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredMaterials.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    No hay materias primas cargadas. Añadí tu primera compra para comenzar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderProductsSection = () => (
    <div className="space-y-8">

      <section className="rounded-3xl border border-border bg-card/50 p-6 shadow-sm ring-1 ring-border/40 backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-semibold">Listado de productos</h3>
            <p className="text-sm text-muted-foreground">
              Visualiza costos por lote, precio recomendado y margen objetivo.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <Button
              type="button"
              onClick={handleCreateProductClick}
              className="w-full sm:w-auto"
            >
              <Plus className="size-4" />
              Nuevo producto
            </Button>
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className={cn(
                  inputStyles,
                  "w-full pl-10 bg-background/60 backdrop-blur",
                )}
                placeholder="Buscar producto..."
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
              />
            </div>
            <select
              className={cn(selectStyles, "w-full sm:w-44")}
              value={productSort}
              onChange={(event) =>
                setProductSort(event.target.value as ProductSortKey)
              }
            >
              <option value="name">Ordenar por nombre</option>
              <option value="unitCost">Ordenar por costo unitario</option>
              <option value="recommendedPrice">Ordenar por precio sugerido</option>
            </select>
            <select
              className={cn(selectStyles, "w-full sm:w-40")}
              value={productSortDirection}
              onChange={(event) =>
                setProductSortDirection(event.target.value as "asc" | "desc")
              }
            >
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </select>
          </div>
        </div>

        {productError && (
          <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {productError}
          </p>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-[880px] divide-y divide-border/70 text-sm w-full">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Producto</th>
                <th className="px-4 py-3 text-left font-medium">Costos</th>
                <th className="px-4 py-3 text-left font-medium">Precio recomendado</th>
                <th className="px-4 py-3 text-left font-medium">Margen</th>
                <th className="px-4 py-3 text-left font-medium">Actualizado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {filteredProducts.map((product) => {
                const expanded = Boolean(expandedProductRows[product.id]);

                return (
                  <React.Fragment key={product.id}>
                    <tr
                      className="hover:bg-muted/20 transition-colors"
                    >
                      <td className="w-[220px] px-4 py-4 align-top">
                        <p className="font-medium text-foreground">{product.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {product.description || "Sin descripción"}
                        </p>
                        <Button
                          type="button"
                          variant="link"
                          className="mt-2 h-auto px-0 text-xs text-primary"
                          onClick={() => toggleProductDetails(product.id)}
                        >
                          <span className="flex items-center gap-1">
                            {expanded ? (
                              <>
                                <ChevronUp className="size-3.5" />
                                Ocultar detalle
                              </>
                            ) : (
                              <>
                                <ChevronDown className="size-3.5" />
                                Mostrar detalle de fórmula
                              </>
                            )}
                          </span>
                        </Button>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="font-medium">
                          {formatCurrency(product.costs.totalCost)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Lote: {formatCompactNumber(product.batchSize)} {product.batchUnit}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Materia prima: {formatCurrency(product.costs.totalMaterialCost)}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="font-medium text-primary">
                          {formatCurrency(product.salePrice)}
                        </p>
                        {product.overrideSalePrice && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Manual: {formatCurrency(product.overrideSalePrice)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p
                          className={cn(
                            "font-medium",
                            product.margin < product.targetMargin
                              ? "text-amber-600"
                              : "text-emerald-600",
                          )}
                        >
                          {product.margin.toFixed(1)}%
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Objetivo: {product.targetMargin.toFixed(1)}%
                        </p>
                        {product.hasWarnings && (
                          <span className="mt-2 inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-600">
                            Revisar insumos
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="text-xs text-muted-foreground">
                          {formatDate(product.updatedAt)}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => startProductEdition(product)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive"
                            onClick={() => handleDeleteProduct(product)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={6} className="bg-muted/10 px-4 pb-6">
                          <div className="mt-4 space-y-2">
                            {product.costs.breakdown.map((item) => {
                              const material = getMaterialById(item.materialId);

                              return (
                                <div
                                  key={`${product.id}-${item.materialId}`}
                                  className={cn(
                                    "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-3 text-sm",
                                    item.valid
                                      ? "border-border/60 bg-background"
                                      : "border-amber-500/50 bg-amber-500/10",
                                  )}
                                >
                                  <div>
                                    <p className="font-medium">
                                      {material?.name ?? "Materia prima eliminada"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatCompactNumber(item.quantity)} {item.unit}
                                    </p>
                                    {!item.valid && item.warning && (
                                      <p className="text-xs text-amber-600">
                                        {item.warning}
                                      </p>
                                    )}
                                  </div>
                                  <p className="font-medium">
                                    {formatCurrency(item.cost, material?.currency)}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!filteredProducts.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    No hay productos cargados. Sumá tu primera fórmula para calcular márgenes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-6">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Centro de costos
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Calculadora de insumos y productos
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                handleMaterialModalClose();
                handleProductModalClose();
              }}
            >
              <RefreshCw className="size-4" />
              Limpiar formularios
            </Button>
            <ModeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-10 px-6 py-10 pb-16 sm:px-8">
        {renderMaterialStats()}

        <nav className="flex flex-col gap-4 rounded-3xl border border-border bg-card/50 p-4 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition",
                  activeView === tab.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50",
                )}
                onClick={() => setActiveView(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {VIEW_TABS.find((tab) => tab.id === activeView)?.helper}
          </p>
        </nav>

        {activeView === "materials" ? renderMaterialsSection() : renderProductsSection()}
      </main>

      <Modal
        open={isMaterialModalOpen}
        onClose={handleMaterialModalClose}
        title={
          materialForm.id ? "Editar materia prima" : "Nueva materia prima"
        }
        description="Guarda el costo unitario base vinculado a cada proveedor."
      >
        <form
          className="space-y-6"
          onSubmit={handleMaterialSubmit}
          autoComplete="off"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              <span>Nombre</span>
              <input
                id="material-name"
                className={inputStyles}
                placeholder="Ej. Aceite de coco"
                value={materialForm.name}
                onChange={(event) =>
                  setMaterialForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              <span>Proveedor</span>
              <input
                id="material-supplier"
                className={inputStyles}
                placeholder="Distribuidor o marca"
                value={materialForm.supplier}
                onChange={(event) =>
                  setMaterialForm((prev) => ({
                    ...prev,
                    supplier: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            <span>Descripción</span>
            <textarea
              id="material-description"
              className={textareaStyles}
              placeholder="Notas sobre calidad, lote o diferenciadores."
              value={materialForm.description}
              onChange={(event) =>
                setMaterialForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
            />
          </label>

          <div className="grid gap-4 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground md:col-span-2">
              <span>Precio de compra</span>
              <input
                id="material-price"
                className={inputStyles}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={materialForm.purchasePrice}
                onChange={(event) =>
                  setMaterialForm((prev) => ({
                    ...prev,
                    purchasePrice: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              <span>Cantidad comprada</span>
              <input
                id="material-quantity"
                className={inputStyles}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={materialForm.purchaseQuantity}
                onChange={(event) =>
                  setMaterialForm((prev) => ({
                    ...prev,
                    purchaseQuantity: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              <span>Unidad</span>
              <select
                id="material-unit"
                className={selectStyles}
                value={materialForm.purchaseUnit}
                onChange={(event) =>
                  setMaterialForm((prev) => ({
                    ...prev,
                    purchaseUnit: event.target.value as Unit,
                  }))
                }
              >
                {MATERIAL_UNITS.map((unit) => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              <span>Precio sugerido</span>
              <input
                id="material-sale"
                className={inputStyles}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={materialForm.salePrice}
                onChange={(event) =>
                  setMaterialForm((prev) => ({
                    ...prev,
                    salePrice: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              <span>Moneda</span>
              <input
                id="material-currency"
                className={inputStyles}
                placeholder="ARS"
                value={materialForm.currency}
                onChange={(event) =>
                  setMaterialForm((prev) => ({
                    ...prev,
                    currency: event.target.value.toUpperCase(),
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              <span>Etiquetas</span>
              <input
                id="material-tags"
                className={inputStyles}
                placeholder="orgánico, premium"
                value={materialForm.tags}
                onChange={(event) =>
                  setMaterialForm((prev) => ({
                    ...prev,
                    tags: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            <span>Notas internas</span>
            <textarea
              id="material-notes"
              className={textareaStyles}
              placeholder="Caducidad, lote, recomendaciones..."
              value={materialForm.notes}
              onChange={(event) =>
                setMaterialForm((prev) => ({
                  ...prev,
                  notes: event.target.value,
                }))
              }
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isSavingMaterial}>
              {isSavingMaterial ? (
                <>
                  <Save className="size-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  {materialForm.id ? "Actualizar materia prima" : "Crear materia prima"}
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleMaterialModalClose}
              disabled={isSavingMaterial}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={isProductModalOpen}
        onClose={handleProductModalClose}
        title={productForm.id ? "Editar producto" : "Nuevo producto"}
        description="Define el lote, asigna materias primas y calcula el precio ideal."
      >
        <form
          className="space-y-6"
          onSubmit={handleProductSubmit}
          autoComplete="off"
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              <span>Nombre</span>
              <input
                id="product-name"
                className={inputStyles}
                placeholder="Ej. Jabón Lavanda"
                value={productForm.name}
                onChange={(event) =>
                  setProductForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,0.5fr)]">
              <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
                <span>Cantidad por lote</span>
                <input
                  id="product-batch-size"
                  className={inputStyles}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={productForm.batchSize}
                  onChange={(event) =>
                    setProductForm((prev) => ({
                      ...prev,
                      batchSize: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
                <span>Unidad</span>
                <select
                  id="product-batch-unit"
                  className={selectStyles}
                  value={productForm.batchUnit}
                  onChange={(event) =>
                    setProductForm((prev) => ({
                      ...prev,
                      batchUnit: event.target.value,
                    }))
                  }
                >
                  {BATCH_UNIT_OPTIONS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            <span>Descripción</span>
            <textarea
              id="product-description"
              className={textareaStyles}
              placeholder="Notas comerciales, combinación de aromas, packaging, etc."
              value={productForm.description}
              onChange={(event) =>
                setProductForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
            />
          </label>

          <div className="space-y-3 rounded-2xl border border-border bg-muted/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Fórmula del lote
              </h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addMaterialLine}
              >
                <Plus className="size-4" />
                Añadir materia prima
              </Button>
            </div>

            <div className="space-y-3">
              {productForm.materials.map((line) => {
                const selectedMaterial = getMaterialById(line.materialId);
                const unitOptions = selectedMaterial
                  ? getUnitOptionsForSystem(selectedMaterial.purchaseUnit)
                  : MASS_UNITS;
                const derived = selectedMaterial
                  ? getMaterialDerivedValues(selectedMaterial)
                  : undefined;

                return (
                  <div
                    key={line.id}
                    className="rounded-xl border border-border/70 bg-background/80 p-4 shadow-sm"
                  >
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] md:items-end">
                      <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Materia prima
                        <select
                          className={selectStyles}
                          value={line.materialId}
                          onChange={(event) =>
                            updateProductMaterialField(
                              line.id,
                              "materialId",
                              event.target.value,
                            )
                          }
                        >
                          <option value="">Selecciona...</option>
                          {rawMaterials.map((material) => (
                            <option key={material.id} value={material.id}>
                              {material.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Cantidad
                        <input
                          className={inputStyles}
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.quantity}
                          onChange={(event) =>
                            updateProductMaterialField(
                              line.id,
                              "quantity",
                              event.target.value,
                            )
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Unidad
                        <select
                          className={selectStyles}
                          value={line.unit}
                          onChange={(event) =>
                            updateProductMaterialField(
                              line.id,
                              "unit",
                              event.target.value,
                            )
                          }
                        >
                          {unitOptions.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive"
                          onClick={() => removeMaterialLine(line.id)}
                          disabled={productForm.materials.length === 1}
                          aria-label="Eliminar materia prima"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    {selectedMaterial && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        {selectedMaterial.name}:{" "}
                        {selectedMaterial.currency
                          ? formatCurrency(
                            derived?.pricePerBaseUnit ?? 0,
                            selectedMaterial.currency,
                          )
                          : formatCompactNumber(derived?.pricePerBaseUnit ?? 0)}{" "}
                        por unidad base (
                        {selectedMaterial.purchaseUnit === "unit"
                          ? "unidad"
                          : selectedMaterial.purchaseUnit}
                        )
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              <span>Mano de obra</span>
              <input
                id="product-labor-cost"
                className={inputStyles}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={productForm.laborCost}
                onChange={(event) =>
                  setProductForm((prev) => ({
                    ...prev,
                    laborCost: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              <span>Otros costos</span>
              <input
                id="product-additional-cost"
                className={inputStyles}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={productForm.additionalCost}
                onChange={(event) =>
                  setProductForm((prev) => ({
                    ...prev,
                    additionalCost: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              <span>Margen deseado %</span>
              <input
                id="product-target-margin"
                className={inputStyles}
                type="number"
                min="0"
                step="1"
                placeholder="40"
                value={productForm.targetMargin}
                onChange={(event) =>
                  setProductForm((prev) => ({
                    ...prev,
                    targetMargin: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              <span>Precio manual (opcional)</span>
              <input
                id="product-override-price"
                className={inputStyles}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={productForm.overrideSalePrice}
                onChange={(event) =>
                  setProductForm((prev) => ({
                    ...prev,
                    overrideSalePrice: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isSavingProduct}>
              {isSavingProduct ? (
                <>
                  <Save className="size-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  {productForm.id ? "Actualizar producto" : "Crear producto"}
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleProductModalClose}
              disabled={isSavingProduct}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
