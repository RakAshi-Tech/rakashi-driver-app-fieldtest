"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

interface MasterSelectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldName: string;
  onSelect: (value: string) => void;
}

// Mock master data
const mockMasterData: Record<string, string[]> = {
  "Shipper name": [
    "ABC Logistics Pvt Ltd",
    "XYZ Transport Co",
    "FastShip India",
    "QuickMove Express",
    "Reliable Cargo Services",
  ],
  "Delivery block number": [
    "BLK-001",
    "BLK-002",
    "BLK-003",
    "BLK-004",
    "BLK-005",
  ],
  Quantity: ["10", "25", "50", "100", "200"],
  "Delivery fee": ["₹150", "₹250", "₹350", "₹500", "₹750"],
};

export function MasterSelectModal({
  open,
  onOpenChange,
  fieldName,
  onSelect,
}: MasterSelectModalProps) {
  const [search, setSearch] = useState("");

  const options = mockMasterData[fieldName] || [];
  const filtered = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (value: string) => {
    onSelect(value);
    onOpenChange(false);
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-base">Select {fieldName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 bg-secondary/50"
            />
          </div>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {filtered.length > 0 ? (
              filtered.map((option) => (
                <Button
                  key={option}
                  variant="ghost"
                  className="w-full justify-start h-10 text-sm hover:bg-secondary"
                  onClick={() => handleSelect(option)}
                >
                  {option}
                </Button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No results found
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
