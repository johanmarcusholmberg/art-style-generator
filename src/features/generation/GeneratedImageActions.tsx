/**
 * GeneratedImageActions — extracted action-bar scaffold (Part B incremental).
 *
 * Currently a minimal action row component. ImageGenerator.tsx still
 * owns the active behavior; this scaffold gives future split iterations
 * a stable shape to migrate into.
 */
import { Button } from "@/components/ui/button";
import { Download, Save, Replace, X, Trash2, Pencil, Printer } from "lucide-react";

export interface GeneratedImageActionsProps {
  onDownload?: () => void;
  onSave?: () => void;
  onReplace?: () => void;
  onRemove?: () => void;
  onEdit?: () => void;
  onExportPrint?: () => void;
  onClose?: () => void;
  disabled?: boolean;
}

export default function GeneratedImageActions(props: GeneratedImageActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {props.onDownload && (
        <Button variant="secondary" size="sm" onClick={props.onDownload} disabled={props.disabled}>
          <Download className="h-4 w-4 mr-1.5" />
          Download
        </Button>
      )}
      {props.onSave && (
        <Button size="sm" onClick={props.onSave} disabled={props.disabled}>
          <Save className="h-4 w-4 mr-1.5" />
          Save
        </Button>
      )}
      {props.onReplace && (
        <Button variant="secondary" size="sm" onClick={props.onReplace} disabled={props.disabled}>
          <Replace className="h-4 w-4 mr-1.5" />
          Replace
        </Button>
      )}
      {props.onEdit && (
        <Button variant="secondary" size="sm" onClick={props.onEdit} disabled={props.disabled}>
          <Pencil className="h-4 w-4 mr-1.5" />
          Edit
        </Button>
      )}
      {props.onExportPrint && (
        <Button variant="secondary" size="sm" onClick={props.onExportPrint} disabled={props.disabled}>
          <Printer className="h-4 w-4 mr-1.5" />
          Export print
        </Button>
      )}
      {props.onRemove && (
        <Button variant="ghost" size="sm" onClick={props.onRemove} disabled={props.disabled}>
          <Trash2 className="h-4 w-4 mr-1.5" />
          Remove
        </Button>
      )}
      {props.onClose && (
        <Button variant="ghost" size="sm" onClick={props.onClose} disabled={props.disabled}>
          <X className="h-4 w-4 mr-1.5" />
          Close
        </Button>
      )}
    </div>
  );
}
