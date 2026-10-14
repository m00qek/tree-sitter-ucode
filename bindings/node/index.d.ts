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
 * The package itself is the `ucode` grammar (plain scripts), so it can be
 * passed straight to `parser.setLanguage()`. All three grammars are also
 * available by name: `ucode`, `ucode_markup` (templates) and `ucdocs`
 * (doc comments).
 */
declare const ucode: Language & {
  ucode: Language;
  ucode_markup: Language;
  ucdocs: Language;
};
export = ucode;
