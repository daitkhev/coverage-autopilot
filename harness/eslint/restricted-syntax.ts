export interface SyntaxBan {
  readonly selector: string;
  readonly message: string;
}

const BANNED_SUFFIXES = 'Manager|Helper|Processor|Provider|Util';

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
  ];
}
