# codegen

This module is responsible for generating code using Vertex AI and Google's Gemini Pro model.
It is used to automate some of the development process.

The main goal of this module is to help with generating repetitive code or code that is hard to write manually.
It is not meant to replace developers, but to help them be more productive.

## Usage

To use the codegen module, simply run the following command:

```
node codegen/index.js
```

This will run the codegen script, which will:

1. Read the source code of the application.
2. Find the fragments marked with `CODEGEN START` and `CODEGEN END` comments.
3. Send the fragments to Vertex AI for code generation.
4. Replace the fragments with the generated code.
5. Save the updated source code.

## Options

The codegen script accepts the following options:

* `--dry-run`: Run the codegen script without updating the source code.
* `--consider-all-files`: Consider all files for code generation, even if they don't contain the `CODEGEN START` and `CODEGEN END` comments.
* `--allow-file-create`: Allow the codegen script to create new files.
* `--allow-file-delete`: Allow the codegen script to delete files.

## Examples

The following examples show how to use the codegen module to generate code for different parts of the application.

### Example 1: Generating a new function

```typescript
// CODEGEN START: Generate a function that calculates the distance between two points
// CODEGEN END
```

This will generate the following code:

```typescript
function calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}
```

### Example 2: Generating a new component

```typescript
// CODEGEN START: Generate a React component that displays a list of items
// CODEGEN END
```

This will generate the following code:

```typescript
import React from 'react';

type Item = {
  id: string;
  name: string;
};

type ItemListProps = {
  items: Item[];
};

const ItemList: React.FC<ItemListProps> = ({ items }) => {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
};

export default ItemList;
```