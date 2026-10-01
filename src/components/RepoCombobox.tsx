import { useState } from "react";
import { Check, ChevronsUpDown, Loader2, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { RepoInfo } from "@/lib/github.functions";

export type RepoComboboxProps = {
  id?: string;
  repos: RepoInfo[];
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
  disabled?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  placeholder?: string;
  emptyText?: string;
};

export function RepoCombobox({
  id,
  repos,
  value,
  onChange,
  loading = false,
  disabled = false,
  error = null,
  onRefresh,
  placeholder = "اختر مستودعًا…",
  emptyText = "لا توجد مستودعات مطابقة.",
}: RepoComboboxProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-w-0 flex flex-col gap-2">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled || loading}
              className="h-11 min-w-0 w-full justify-between rounded-xl px-4 py-3 text-sm font-normal"
            >
              <span className={cn("mono min-w-0 truncate", !value && "text-muted-foreground")} dir="ltr">
                {value || placeholder}
              </span>
              {loading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-60" />
              ) : (
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[--radix-popover-trigger-width] p-0"
            align="start"
          >
            <Command
              filter={(itemValue, search) =>
                itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
              }
            >
              <CommandInput placeholder="ابحث باسم المستودع…" dir="ltr" />
              <CommandList>
                <CommandEmpty>{emptyText}</CommandEmpty>
                <CommandGroup>
                  {repos.map((repo) => (
                    <CommandItem
                      key={repo.fullName}
                      value={repo.fullName}
                      onSelect={(selected) => {
                        onChange(selected === value ? "" : selected);
                        setOpen(false);
                      }}
                      className="gap-2"
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          value === repo.fullName ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="mono truncate text-xs" dir="ltr">
                        {repo.fullName}
                      </span>
                      {repo.isPrivate && (
                        <Lock className="ms-auto h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {onRefresh && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onRefresh}
            disabled={disabled || loading}
            aria-label="تحديث قائمة المستودعات"
            className="shrink-0 rounded-xl"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive" dir="auto">
          {error}
        </p>
      )}
      {!error && !loading && !disabled && repos.length === 0 && (
        <p className="text-xs text-muted-foreground">لا توجد مستودعات في هذا الحساب.</p>
      )}
    </div>
  );
}
