import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("item_code");
      if (error) throw error;
      return data;
    },
  });
}

export function useWarehouses() {
  return useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .order("warehouse_name");
      if (error) throw error;
      return data;
    },
  });
}

export function useStockLevels() {
  return useQuery({
    queryKey: ["stock_levels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_levels")
        .select("*")
        .gt("current_stock", 0);
      if (error) throw error;
      return data;
    },
  });
}

export function useStockMovements(types?: string[]) {
  return useQuery({
    queryKey: ["stock_movements", types ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("stock_movements")
        .select("*, products(item_code, item_description), warehouses(warehouse_name)")
        .order("movement_date", { ascending: false })
        .limit(5000);
      if (types && types.length) q = q.in("movement_type", types);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useAddProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      products: { category: string | null; item_code: string; item_description: string | null }[]
    ) => {
      const { data, error } = await supabase
        .from("products")
        .upsert(products, { onConflict: "item_code", ignoreDuplicates: true })
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock_levels"] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { count, error: countError } = await supabase
        .from("stock_movements")
        .select("id", { count: "exact", head: true })
        .eq("product_id", id);
      if (countError) throw countError;
      if ((count ?? 0) > 0) {
        throw new Error("Cannot delete: this product has stock movements recorded against it.");
      }
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock_levels"] });
    },
  });
}

export function useAddStockMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (movement: {
      product_id: string;
      warehouse_id: string;
      movement_type: string;
      quantity: number;
      reference_note?: string;
      batch_id?: string;
      movement_date?: string;
    }) => {
      const { data, error } = await supabase
        .from("stock_movements")
        .insert(movement)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock_movements"] });
      queryClient.invalidateQueries({ queryKey: ["stock_levels"] });
    },
  });
}

export function useTransferStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transfer: {
      product_id: string;
      from_warehouse_id: string;
      to_warehouse_id: string;
      quantity: number;
      reference_note?: string;
      batch_id?: string;
    }) => {
      // Insert TRANSFER_OUT from source
      const { error: outError } = await supabase
        .from("stock_movements")
        .insert({
          product_id: transfer.product_id,
          warehouse_id: transfer.from_warehouse_id,
          movement_type: "TRANSFER_OUT",
          quantity: transfer.quantity,
          reference_note: transfer.reference_note,
          batch_id: transfer.batch_id,
        });
      if (outError) throw outError;

      // Insert TRANSFER_IN to destination
      const { error: inError } = await supabase
        .from("stock_movements")
        .insert({
          product_id: transfer.product_id,
          warehouse_id: transfer.to_warehouse_id,
          movement_type: "TRANSFER_IN",
          quantity: transfer.quantity,
          reference_note: transfer.reference_note,
          batch_id: transfer.batch_id,
        });
      if (inError) throw inError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock_movements"] });
      queryClient.invalidateQueries({ queryKey: ["stock_levels"] });
    },
  });
}

export function useAddWarehouse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { warehouse_name: string }) => {
      const { data, error } = await supabase
        .from("warehouses")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["stock_levels"] });
    },
  });
}

export function useUpdateWarehouse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; warehouse_name: string }) => {
      const { data, error } = await supabase
        .from("warehouses")
        .update({ warehouse_name: payload.warehouse_name })
        .eq("id", payload.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["stock_levels"] });
    },
  });
}
