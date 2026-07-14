import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Folder, FolderPlus, Spinner } from "@phosphor-icons/react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useToast } from "../components/ui/toast";
import { folderAPI } from "../services/api";

const CREATE_SENTINEL = "__create_new_folder__";
const UNCATEGORIZED_SENTINEL = "__uncategorized__";

/**
 * Folder picker used on the upload tabs.
 *
 * - `value` is a folder id (number) or `null` for "Uncategorized".
 * - Selecting "Create new folder…" opens an inline dialog so the user can
 *   make a folder without leaving the upload form; the new folder is then
 *   auto-selected.
 */
export default function FolderSelect({ value, onChange, folders, onFoldersChange, allowCreate = true }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const selectValue = value == null ? UNCATEGORIZED_SENTINEL : String(value);

  const doCreate = async (e) => {
    e?.preventDefault?.();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const res = await folderAPI.create(trimmed);
      const folder = res.data;
      onFoldersChange?.((prev) => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(folder.id);
      setName("");
      setCreateOpen(false);
      toast({ title: t("dashboard.folderCreated") || "Folder created", description: trimmed });
    } catch (err) {
      if (err.response?.status === 409) {
        toast({ variant: "destructive", title: t("dashboard.folderExists") || "Folder already exists" });
      } else {
        toast({ variant: "destructive", title: t("common.error") });
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (allowCreate && v === CREATE_SENTINEL) {
            setCreateOpen(true);
            return;
          }
          onChange(v === UNCATEGORIZED_SENTINEL ? null : Number(v));
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t("upload.selectFolder") || "Select folder"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNCATEGORIZED_SENTINEL}>
            <span className="flex items-center gap-2">
              <Folder className="h-4 w-4" />
              {t("dashboard.uncategorized") || "Uncategorized"}
            </span>
          </SelectItem>
          {folders.map((f) => (
            <SelectItem key={f.id} value={String(f.id)}>
              <span className="flex items-center gap-2">
                <Folder className="h-4 w-4" />
                {f.name}
              </span>
            </SelectItem>
          ))}
          {allowCreate && (
            <SelectItem value={CREATE_SENTINEL}>
              <span className="flex items-center gap-2 text-primary">
                <FolderPlus className="h-4 w-4" />
                {t("upload.createFolderInline") || "Create new folder…"}
              </span>
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.newFolder") || "New folder"}</DialogTitle>
            <DialogDescription>
              {t("dashboard.newFolderHint") || "Group related tracks together."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={doCreate} className="mt-4 space-y-4">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("dashboard.folderNamePlaceholder") || "Folder name"}
            />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline" type="button">{t("common.cancel")}</Button>
              </DialogClose>
              <Button type="submit" disabled={creating || !name.trim()} className="gap-2">
                {creating ? <Spinner className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
                {t("dashboard.create") || "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
