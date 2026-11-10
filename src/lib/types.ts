export type Item = {
  id: string;
  name: string;
  icon?: string;
  grade?: string;
  description?: string;
  stats?: {
    label: string;
    value: number;
  }[];
  level?: string;
  weight?: number;
  type?: string;
};

export type Recipe = {
  id: string;
  itemId: string;
  name: string;
  station: string;
  stationIcon?: string;
  group?: string;
  output: number;
  cost?: number;
  costType?: string;
  materials: {
    itemId: string;
    count: number;
  }[];
};

export type Catalog = {
  items: Item[];
  recipes: Recipe[];
  sourceUrl: string;
  importedAt: string;
};

export type Inventory = Record<string, number>;
