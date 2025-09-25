package main

import (
    "fmt"
    "net/http"
    "log"
)

type User struct {
    ID   int    `json:"id"`
    Name string `json:"name"`
    Age  int    `json:"age"`
}

func main() {
    users := []User{
        {ID: 1, Name: "Alice", Age: 30},
        {ID: 2, Name: "Bob", Age: 25},
    }

    for _, user := range users {
        fmt.Printf("User: %s, Age: %d\n", user.Name, user.Age)
    }

    http.HandleFunc("/", handleHome)
    log.Println("Server starting on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}

func handleHome(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }
    
    fmt.Fprintf(w, "Hello, World!")
}