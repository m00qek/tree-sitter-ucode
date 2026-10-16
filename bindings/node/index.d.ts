type BaseNode = {
  type: string;
  named: boolean;
};

type ChildNode = {
  multiple: boolean;
  required: boolean;
  types: BaseNode[];
};

type NodeInfo =
  | (BaseNode & {
      subtypes: BaseNode[];
    })
  | (BaseNode & {
      fields: { [name: string]: ChildNode };
      children: ChildNode[];
    });

type Language = {
  language: unknown;
  nodeTypeInfo: NodeInfo[];
};

/**
 * The `ucode` grammar, so it can go straight to `parser.setLanguage()`.
 * All three grammars are also exported by name: `ucode`, `ucode_markup`
 * (templates) and `ucdocs` (doc comments).
 */
declare const ucode: Language & {
  ucode: Language;
  ucode_markup: Language;
  ucdocs: Language;
};
export = ucode;
