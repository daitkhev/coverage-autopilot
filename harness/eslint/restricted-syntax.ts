export interface SyntaxBan {
  readonly selector: string;
  readonly message: string;
}

const BANNED_SUFFIXES = 'Manager|Helper|Processor|Provider|Util';

const PROCESS_MODULE = 'ImportDeclaration[source.value=/^(node:)?process$/]';

/**
 * Every way to reach the environment of the process: as a property, with
 * a name or with a text, on the global or through `globalThis`; by taking
 * the object apart; and through the module, by the name, by the default or
 * by everything at once.
 */
const ENVIRONMENT_READS = [
  "MemberExpression[object.name='process'][property.name='env']",
  "MemberExpression[object.name='process'][property.value='env']",
  "MemberExpression[object.property.name='process'][property.name='env']",
  "MemberExpression[object.property.name='process'][property.value='env']",
  "VariableDeclarator[init.name='process'] > ObjectPattern > Property[key.name='env']",
  `${PROCESS_MODULE} > ImportSpecifier[imported.name='env']`,
  `${PROCESS_MODULE} > ImportDefaultSpecifier`,
  `${PROCESS_MODULE} > ImportNamespaceSpecifier`,
];

/** Left out for the few files that are there to read the environment. */
export const ENVIRONMENT_BAN: SyntaxBan = {
  selector: ENVIRONMENT_READS.join(', '),
  message:
    'Only an entry file reads the environment. Take a value as an argument.',
};

/** Shapes of code the policy refuses, as selectors over the syntax tree. */
export function syntaxBans(maxParameters: number): SyntaxBan[] {
  const count = String(maxParameters);
  const notConstructor =
    ":not(MethodDefinition[kind='constructor'] > FunctionExpression)";
  return [
    {
      selector: `:function${notConstructor}[params.length>${count}]`,
      message: `A function takes at most ${count} parameters. Pass an object.`,
    },
    {
      selector:
        ":function > Identifier.params[typeAnnotation.typeAnnotation.type='TSBooleanKeyword']",
      message:
        'A boolean parameter hides two functions. Write two, or pass an object.',
    },
    {
      selector: "CallExpression[callee.property.name='then']",
      message: 'Use await, not then().',
    },
    {
      selector: `ClassDeclaration[id.name=/(${BANNED_SUFFIXES})$/]`,
      message: 'This suffix says nothing. Name the class after what it does.',
    },
    {
      selector: "NewExpression[callee.name='Date']",
      message: 'The real clock is read in one adapter only. Take a Clock.',
    },
    {
      selector:
        "CallExpression[callee.object.name='Date'][callee.property.name='now']",
      message: 'The real clock is read in one adapter only. Take a Clock.',
    },
    ENVIRONMENT_BAN,
  ];
}
