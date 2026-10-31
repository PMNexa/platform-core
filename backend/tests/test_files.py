"""A `FileField` on a resource: described as `type: "file"` (with the
picker's `accept`), written by a multipart create/update like any other
field, read back as the stored name, fetched from `<resource>/<id>/files/
<field>` through the row's own scoping. Resources without one get no
`files` route."""

import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from tests.testapp.models import Book

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def schema_field(response, name):
    return next(field for field in response.json()["fields"] if field["name"] == name)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix="core-files-"))
class FileFieldTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.credentials(HTTP_X_AS="alice")

    def test_schema_describes_a_file_field(self):
        field = schema_field(self.client.get("/books/schema"), "cover")
        self.assertEqual(field["type"], "file")
        self.assertEqual(field["accept"], ".png,.jpg")
        self.assertFalse(field["read_only"])

    def test_multipart_create_then_download(self):
        response = self.client.post(
            "/books", {"title": "Dune", "owner": "alice", "cover": SimpleUploadedFile("dune.png", PNG)}, format="multipart"
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertRegex(response.json()["cover"], r"^covers/dune\S*\.png$")
        book_id = response.json()["id"]

        download = self.client.get(f"/books/{book_id}/files/cover")
        self.assertEqual(download.status_code, 200)
        self.assertEqual(b"".join(download.streaming_content), PNG)
        self.assertIn("dune", download["Content-Disposition"])

        # Replaced by a multipart update; the name follows.
        response = self.client.patch(f"/books/{book_id}", {"cover": SimpleUploadedFile("dune2.png", PNG)}, format="multipart")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertRegex(response.json()["cover"], r"^covers/dune2\S*\.png$")

    def test_json_create_still_works_without_a_file(self):
        response = self.client.post("/books", {"title": "Dune", "owner": "alice"}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertIsNone(response.json()["cover"])  # an empty FileField reads as null
        self.assertEqual(self.client.get(f"/books/{response.json()['id']}/files/cover").status_code, 404)

    def test_download_follows_the_row_s_scoping(self):
        book = Book.objects.create(title="Dune", owner="alice")
        book.cover.save("dune.png", SimpleUploadedFile("dune.png", PNG))
        self.assertEqual(self.client.get(f"/books/{book.id}/files/cover").status_code, 200)
        self.assertEqual(self.client.get(f"/books/{book.id}/files/title").status_code, 404)
        stranger = APIClient()
        stranger.credentials(HTTP_X_AS="bob")
        self.assertEqual(stranger.get(f"/books/{book.id}/files/cover").status_code, 404)

    def test_no_files_route_without_a_file_field(self):
        from tests.testapp.models import Shelf

        shelf = Shelf.objects.create(name="A", owner="alice")
        self.assertEqual(self.client.get(f"/shelves/{shelf.id}/files/name").status_code, 404)
        self.assertEqual(self.client.get(f"/shelves/{shelf.id}").status_code, 200)
