package config

import (
	"fmt"
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type ApplicationConfig struct {
	Port int64
}

func LoadApplicationConfig() (error, *ApplicationConfig) {

	err := godotenv.Load()

	if err != nil {
		log.Fatal("Error loading .env file")
	}

	err, portString := getVar("PORT", "8080", true)
	if err != nil {
		return err, nil
	}

	port, err := strconv.ParseInt(portString, 10, 64)
	if err != nil {
		return err, nil
	}

	return nil, &ApplicationConfig{
		Port: port,
	}

}

func getVar(varName string, defaultValue string, isRequired bool) (error, string) {
	varValue := os.Getenv(varName)

	if varValue == "" {

		if isRequired {
			return fmt.Errorf("%s is missing and required : ", varName), ""
		}

		return nil, defaultValue

	}

	return nil, varValue

}
