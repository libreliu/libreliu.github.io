# LibreLiu's Blog

## Useful commands

`npm install . && npm run build && npm run server`

## Useful debugging pieces
```
<% 
JSON.safeStringify = (obj, indent = 2) => {
    let cache = [];
    const retVal = JSON.stringify(
      obj,
      (key, value) =>
        typeof value === "object" && value !== null
          ? cache.includes(value)
            ? undefined // Duplicate reference found, discard key
            : cache.push(value) && value // Store value in our collection
          : value,
      indent
    );
    cache = null;
    return retVal;
};
  
console.log("foo: " + JSON.safeStringify(page)); 
%>
```