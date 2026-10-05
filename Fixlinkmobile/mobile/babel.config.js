// Expo Babel config. Adds the Locator data-ids plugin in development so the
// web target (`expo start --web`) supports Alt plus click to open source.
// The plugin no-ops outside development via its `env` option, and the native
// runtime stays untouched because setup runs only in `setupLocator.web.ts`.
//
// React Native Web strips unknown props such as `data-locatorjs-id`, so the
// bridge below rewrites them to the `dataSet` prop that React Native Web
// forwards as real `data-*` DOM attributes. Lowercase host tags keep the
// attribute as is because plain DOM renders `data-*` natively.
function locatorRnWebBridge({ types: t }) {
  const isComponentTag = (name) =>
    name.type === 'JSXMemberExpression' ||
    (name.type === 'JSXIdentifier' && /^[A-Z]/.test(name.name));
  return {
    visitor: {
      JSXElement(path) {
        const opening = path.node.openingElement;
        if (!isComponentTag(opening.name)) return;
        const attrs = opening.attributes;
        const idIndex = attrs.findIndex(
          (attr) =>
            t.isJSXAttribute(attr) &&
            t.isJSXIdentifier(attr.name, { name: 'data-locatorjs-id' }),
        );
        if (idIndex === -1) return;
        const idAttr = attrs[idIndex];
        let idValue = null;
        if (t.isStringLiteral(idAttr.value)) {
          idValue = idAttr.value.value;
        } else if (
          t.isJSXExpressionContainer(idAttr.value) &&
            t.isStringLiteral(idAttr.value.expression)
        ) {
          idValue = idAttr.value.expression.value;
        }
        if (idValue == null) return;
        attrs.splice(idIndex, 1);
        const locatorProp = t.objectProperty(
          t.identifier('locatorjsId'),
          t.stringLiteral(idValue),
        );
        const dataSetAttr = attrs.find(
          (attr) =>
            t.isJSXAttribute(attr) &&
            t.isJSXIdentifier(attr.name, { name: 'dataSet' }),
        );
        if (
          dataSetAttr &&
          t.isJSXExpressionContainer(dataSetAttr.value) &&
          t.isObjectExpression(dataSetAttr.value.expression)
        ) {
          dataSetAttr.value.expression.properties.push(locatorProp);
        } else {
          attrs.push(
            t.jsxAttribute(
              t.jsxIdentifier('dataSet'),
              t.jsxExpressionContainer(t.objectExpression([locatorProp])),
            ),
          );
        }
      },
    },
  };
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module:@locator/babel-jsx', { env: 'development' }],
      locatorRnWebBridge,
    ],
  };
};
