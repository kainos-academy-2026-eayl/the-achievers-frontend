provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "frontend" {
  name     = var.resource_group_name
  location = var.location

  tags = {
    environment = var.environment
    project     = "achievers-frontend"
  }
}