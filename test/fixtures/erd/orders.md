erDiagram
    %% A small order system, exercising every cardinality this reader accepts.
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    CUSTOMER }|..|{ DELIVERY_ADDRESS : uses
    ORDER }o--|| COURIER : "shipped by"
    CUSTOMER {
        string name
        string custNumber PK
        int sector "north or south"
    }
    ORDER {
        int orderId PK
        string custNumber FK
        string status
    }
    LINE_ITEM {
        int lineId PK
        int orderId FK
        int quantity
    }
