# Refactoring Suggestions: basicapi.java

Based on the review findings, here are the recommended improvements:

## Critical Issues to Address

### 1. Fix Resource Management with Try-With-Resources
**Issue**: Potential `OutputStream` leak
**Fix**: Use try-with-resources to ensure stream is always closed
```java
try (OutputStream os = exchange.getResponseBody()) {
    os.write(response.getBytes(StandardCharsets.UTF_8));
}
```

### 2. Correct Content-Length Calculation
**Issue**: `response.length()` returns char count, not byte count
**Fix**: Calculate actual byte length after UTF-8 encoding
```java
byte[] responseBytes = response.getBytes(StandardCharsets.UTF_8);
exchange.sendResponseHeaders(200, responseBytes.length);
os.write(responseBytes);
```

### 3. Add Required HTTP Headers
**Issue**: Missing `Content-Type` header
**Fix**: Set explicit charset and content type
```java
exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=UTF-8");
```

## Code Structure Improvements

### 4. Separate Handler into Its Own Class
Extract `HelloHandler` for better organization and reusability.

### 5. Introduce Configuration Management
Move hardcoded port (8080) to a configuration class or environment variable:
```java
private static final int PORT = Integer.parseInt(System.getenv("API_PORT") != null ? System.getenv("API_PORT") : "8080");
```

### 6. Add Logging Framework
Replace `System.out.println` with SLF4J for proper logging levels and configuration.

## Scalability & Production-Readiness

### 7. Configure Thread Pool Executor
Replace `setExecutor(null)` with a configured `ExecutorService`:
```java
ExecutorService executor = Executors.newFixedThreadPool(10);
server.setExecutor(executor);
```

### 8. Add Graceful Shutdown
Implement shutdown hook to stop server cleanly:
```java
Runtime.getRuntime().addShutdownHook(new Thread(() -> server.stop(0)));
```

### 9. Add Error Handling and Validation
Wrap server startup in try-catch blocks with meaningful error messages.

### 10. Add Request Logging
Log incoming requests with method, path, and response status for debugging.

## Summary of Priority

**High Priority**: 1, 2, 3 (Resource management and HTTP compliance)
**Medium Priority**: 4, 5, 6, 7, 8 (Code quality and scalability)
**Low Priority**: 9, 10 (Nice-to-have monitoring)